"use server"

import { init, lookup } from "@instantdb/admin"
import schema from "@inventory/instant.schema"
import Exa from "exa-js"
import { streamText } from "ai"
import { z } from "zod"

// Helpers (no funciones dentro de funciones)
function isDigits(str: string): boolean {
  return /^\d+$/.test(str)
}

function validateEAN13(code: string): boolean {
  if (code.length !== 13 || !isDigits(code)) return false
  const digits = code.split("").map(Number)
  const checksum = digits.pop() as number
  const sum = digits.map((d, i) => (i % 2 === 0 ? d : d * 3)).reduce((a, b) => a + b, 0)
  const calc = (10 - (sum % 10)) % 10
  return calc === checksum
}

function validateEAN8(code: string): boolean {
  if (code.length !== 8 || !isDigits(code)) return false
  const digits = code.split("").map(Number)
  const checksum = digits.pop() as number
  const weights = [3, 1, 3, 1, 3, 1, 3]
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0)
  const calc = (10 - (sum % 10)) % 10
  return calc === checksum
}

export type IdentifierScheme = "EAN13" | "EAN8" | "NUMERIC"

function classifyIdentifier(str: string): { scheme: IdentifierScheme; isValid: boolean } {
  if (str.length === 13 && validateEAN13(str)) return { scheme: "EAN13", isValid: true }
  if (str.length === 8 && validateEAN8(str)) return { scheme: "EAN8", isValid: true }
  if (isDigits(str)) return { scheme: "NUMERIC", isValid: true }
  return { scheme: "NUMERIC", isValid: false }
}

type ExternalProduct = {
  source: string
  raw: any
  mapped: {
    name?: string
    description?: string
    brand?: string
    imageUrl?: string
    quantity?: string
    categories?: string
  }
} | null

function isIsbn13FromEan13(ean13: string): boolean {
  return ean13.length === 13 && isDigits(ean13) && (ean13.startsWith("978") || ean13.startsWith("979"))
}

function mapOpenFoodFactsProduct(product: any): ExternalProduct {
  if (!product) return null
  return {
    source: "openfoodfacts",
    raw: product,
    mapped: {
      name: product.product_name || product.product_name_es || product.product_name_en || undefined,
      description:
        product.generic_name || product.generic_name_es || product.generic_name_en || product.brands || undefined,
      brand: product.brands || undefined,
      imageUrl: product.image_url || product.image_front_url || undefined,
      quantity: product.quantity || undefined,
      categories: product.categories || undefined,
    },
  }
}

async function lookupOpenFoodFactsProduct(barcode: string): Promise<ExternalProduct> {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
    const res = await fetch(url, {
      headers: { "User-Agent": "pulzar-inventory/1.0 (+https://pulzar.app)" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data: any = await res.json()
    if (data?.status === 1 && data?.product) {
      return mapOpenFoodFactsProduct(data.product)
    }
    return null
  } catch (_) {
    return null
  }
}

function mapOpenLibraryBook(isbn13: string, ol: any): ExternalProduct {
  if (!ol) return null
  const title: string | undefined = ol.title || undefined
  const description: string | undefined = typeof ol.description === "string" ? ol.description : ol?.description?.value
  const publishers: string | undefined = Array.isArray(ol.publishers) ? ol.publishers.join(", ") : undefined
  const subjects: string | undefined = Array.isArray(ol.subjects) ? ol.subjects.join(", ") : undefined
  const imageUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn13)}-L.jpg`
  return {
    source: "openlibrary",
    raw: ol,
    mapped: { name: title, description: description || publishers, brand: publishers, imageUrl, quantity: undefined, categories: subjects },
  }
}

function mapGoogleBooksVolume(vol: any): ExternalProduct {
  if (!vol) return null
  const info = vol.volumeInfo || {}
  const authors: string | undefined = Array.isArray(info.authors) ? info.authors.join(", ") : undefined
  const categories: string | undefined = Array.isArray(info.categories) ? info.categories.join(", ") : undefined
  return {
    source: "googlebooks",
    raw: vol,
    mapped: {
      name: info.title || undefined,
      description: info.description || authors || undefined,
      brand: authors,
      imageUrl: info.imageLinks?.thumbnail || info.imageLinks?.small || info.imageLinks?.medium || undefined,
      quantity: undefined,
      categories,
    },
  }
}

async function lookupBookByISBN(isbn13: string): Promise<ExternalProduct> {
  try {
    const olRes = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn13)}.json`, {
      headers: { "User-Agent": "pulzar-inventory/1.0 (+https://pulzar.app)" },
      cache: "no-store",
    })
    if (olRes.ok) {
      const olJson = await olRes.json()
      const mapped = mapOpenLibraryBook(isbn13, olJson)
      if (mapped) return mapped
    }
  } catch (_) { }

  try {
    const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn13)}`, {
      headers: { "User-Agent": "pulzar-inventory/1.0 (+https://pulzar.app)" },
      cache: "no-store",
    })
    if (gbRes.ok) {
      const gbJson: any = await gbRes.json()
      const item = gbJson?.items?.[0]
      const mapped = mapGoogleBooksVolume(item)
      if (mapped) return mapped
    }
  } catch (_) { }

  return null
}

async function lookupProductByIdentifier(value: string, info: { scheme: IdentifierScheme; isValid: boolean }): Promise<ExternalProduct> {
  if (info.scheme === "EAN13" && isIsbn13FromEan13(value)) {
    return await lookupBookByISBN(value)
  }
  return await lookupOpenFoodFactsProduct(value)
}

async function mergeEventContent(scopedDb: any, eventId: string, patch: (current: any) => any) {
  const res = await scopedDb.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
  const existing: any = (res as any).events?.[0]
  const currentContent = existing?.content ?? {}
  const nextContent = patch(currentContent)
  await scopedDb.transact([scopedDb.tx.events[eventId].update({ content: nextContent })])
}

async function aiFallback(barcode: string): Promise<ExternalProduct> {
  try {
    const systemInstruction = `Eres un asistente que genera un esquema JSON ESTRICTO para un producto identificado por un código.\nDevuelve SOLO JSON válido con estas claves: name, description, brand, imageUrl, quantity, categories.\nSi una clave no aplica o no se conoce, usa null. No incluyas texto adicional.`
    const userPrompt = `Dado el código: ${barcode}\n\nObjetivo: Genera un JSON estrictamente con estas claves y valores string o null:\n{\n  "name": string | null,\n  "description": string | null,\n  "brand": string | null,\n  "imageUrl": string | null,\n  "quantity": string | null,\n  "categories": string | null\n}`
    const result = await streamText({ model: 'openai/gpt-oss-120b', system: systemInstruction, prompt: userPrompt })
    let full = ""
    for await (const chunk of result.textStream) { full += chunk }
    const jsonMatch = full.match(/\{[\s\S]*\}$/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(full)
    const mapped = {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      brand: typeof parsed.brand === 'string' ? parsed.brand : undefined,
      imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : undefined,
      quantity: typeof parsed.quantity === 'string' ? parsed.quantity : undefined,
      categories: typeof parsed.categories === 'string' ? parsed.categories : undefined,
    }
    return { source: 'ai', raw: parsed, mapped }
  } catch (_) {
    return null
  }
}

async function aiWebSearchWithTools(barcode: string): Promise<ExternalProduct> {
  try {
    const apiKey = process.env.EXA_API_KEY || process.env.NEXT_PUBLIC_EXA_API_KEY
    if (!apiKey) return null
    const exa = new Exa(apiKey)
    const initial = await exa.search(`barcode ${barcode}`, { numResults: 5, type: "keyword" })
    const tools: any = {
      exaSearch: {
        description: "Realiza búsqueda web y devuelve resultados asociados.",
        parameters: z.object({ query: z.string().min(1), numResults: z.number().int().min(1).max(8).optional().default(5) }),
        execute: async ({ query, numResults }: { query: string; numResults?: number }) => {
          const r = await exa.search(query, { numResults: Math.min(Math.max(numResults ?? 5, 1), 8) })
          return { results: (r?.results ?? []).map((it: any) => ({ title: it.title, url: it.url, id: it.id })) }
        },
      },
    }
    const system = `Eres un asistente investigador. Puedes usar la tool exaSearch para refinar la búsqueda.\nTu salida FINAL debe ser SOLO un JSON válido con las claves: name, description, brand, imageUrl, quantity, categories.`
    const initialSummary = JSON.stringify({ initialResults: (initial?.results ?? []).map((r: any) => ({ title: r.title, url: r.url })) })
    const prompt = `Código: ${barcode}\nTarea: Busca en la web información del producto. Puedes llamar exaSearch tantas veces como necesites.\nCuando termines, responde SOLO con este JSON (strings o null):\n{"name": string|null, "description": string|null, "brand": string|null, "imageUrl": string|null, "quantity": string|null, "categories": string|null}\nContexto inicial: ${initialSummary}`
    const result = await streamText({ model: 'openai/gpt-oss-120b', system, prompt, tools })
    let full = ""
    for await (const chunk of result.textStream) { full += chunk }
    const jsonMatch = full.match(/\{[\s\S]*\}$/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(full)
    const mapped = {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      brand: typeof parsed.brand === 'string' ? parsed.brand : undefined,
      imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : undefined,
      quantity: typeof parsed.quantity === 'string' ? parsed.quantity : undefined,
      categories: typeof parsed.categories === 'string' ? parsed.categories : undefined,
    }
    return { source: 'ai-web', raw: parsed, mapped }
  } catch (_) {
    return null
  }
}

export async function runIdentifierAnalysis(params: { userEmail: string; eventId: string; raw: string; orgId?: string }) {
  const { userEmail, eventId, raw, orgId } = params
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const scopedDb = db.asUser({ email: userEmail })

  try {
    const info = classifyIdentifier(raw)
    // Map a tipos de Identifier
    const typeFromScheme = info.scheme === "EAN13" ? "GTIN13" : info.scheme === "EAN8" ? "EAN8" : "OTHER"
    const symbology = info.scheme === "EAN13" ? "EAN13" : info.scheme === "EAN8" ? "EAN8" : undefined

    await mergeEventContent(scopedDb, eventId, (current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        identifier: { value: raw, type: typeFromScheme, symbology, valid: info.isValid },
      },
    }))

    const now = new Date().toISOString()
    const qr = await scopedDb.query({ identifiers: { $: { where: { value: raw }, limit: 1 }, item: {} } } as any)
    const existingIdentifier: any = (qr as any).identifiers?.[0]
    let identifierId = existingIdentifier?.id as string | undefined

    if (!identifierId) {
      identifierId = crypto.randomUUID()
      await scopedDb.transact([
        scopedDb.tx.identifiers[identifierId].create({ type: typeFromScheme, value: raw, symbology, createdAt: now }),
        scopedDb.tx.organizations[lookup("clerkOrgId", orgId)].link({ identifiers: identifierId }),
      ])
    }

    let itemId: string | undefined = existingIdentifier?.item?.id
    if (!itemId) {
      itemId = crypto.randomUUID()
      await scopedDb.transact([
        scopedDb.tx.items[itemId].create({ name: "", description: "", price: 0, sku: "", status: "pending", stock: 0, createdAt: now, updatedAt: now }),
        scopedDb.tx.items[itemId].link({ identifiers: identifierId }),
        scopedDb.tx.organizations[lookup("clerkOrgId", orgId)].link({ items: itemId }),
      ])
    }

    await mergeEventContent(scopedDb, eventId, (current) => ({
      ...current,
      analysis: { ...(current.analysis ?? {}), resolved: { identifierId, itemId } },
    }))

    let external = await lookupProductByIdentifier(raw, info)
    if (!external) {
      external = await aiWebSearchWithTools(raw) || await aiFallback(raw)
    }

    try {
      if (itemId && external?.mapped) {
        const ir = await scopedDb.query({ items: { $: { where: { id: itemId }, limit: 1 } } })
        const currentItem: any = (ir as any).items?.[0]
        if (currentItem) {
          const itemUpdate: any = {}
          const mapped = external.mapped
          const currentName: string = currentItem.name ?? ""
          const currentDescription: string = currentItem.description ?? ""
          const currentSku: string = currentItem.sku ?? ""
          if (mapped.name && (!currentName || currentName.trim() === "")) itemUpdate.name = mapped.name
          if (mapped.description && (!currentDescription || currentDescription.trim() === "")) itemUpdate.description = mapped.description
           if (!currentSku || currentSku.trim() === "") itemUpdate.sku = raw
          if (Object.keys(itemUpdate).length > 0) {
            itemUpdate.updatedAt = new Date().toISOString()
            await scopedDb.transact([scopedDb.tx.items[itemId].update(itemUpdate)])
          }
        }
      }
    } catch (_) { }

    await mergeEventContent(scopedDb, eventId, (current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        productLookup: external
          ? { ok: true, provider: external.source, fetchedAt: new Date().toISOString(), mapped: external.mapped, raw: external.raw }
          : { ok: false, provider: "ai", fetchedAt: new Date().toISOString() },
      },
    }))
  } catch (error) {
    console.error("runIdentifierAnalysis error", error)
  }
}


