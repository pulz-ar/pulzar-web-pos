"use server"

import { init, lookup } from "@instantdb/admin"
import schema from "@inventory/instant.schema"
import { generateObject, streamText } from "ai"
import Exa from "exa-js"
import { z } from "zod"

export async function runBarcodeAnalysis(params: {
  appId: string
  adminToken: string
  eventId: string
  raw: string
  orgId?: string
}) {
  const { appId, adminToken, eventId, raw, orgId } = params
  const db = init({ appId, adminToken, schema })

  // Heurísticas de validación: EAN-13 / EAN-8 (checksum), fallback numérico
  function isDigits(str: string): boolean {
    return /^\d+$/.test(str)
  }

  function validateEAN13(code: string): boolean {
    if (code.length !== 13 || !isDigits(code)) return false
    const digits = code.split("").map(Number)
    const checksum = digits.pop() as number
    const sum = digits
      .map((d, i) => (i % 2 === 0 ? d : d * 3))
      .reduce((a, b) => a + b, 0)
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

  function classifyBarcode(str: string): { scheme: "EAN13" | "EAN8" | "NUMERIC"; isValid: boolean } {
    if (str.length === 13 && validateEAN13(str)) return { scheme: "EAN13", isValid: true }
    if (str.length === 8 && validateEAN8(str)) return { scheme: "EAN8", isValid: true }
    if (isDigits(str)) return { scheme: "NUMERIC", isValid: true }
    return { scheme: "NUMERIC", isValid: false }
  }

  // Lookup externo básico usando OpenFoodFacts (sin API key)
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

  // ISBN helpers
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
        // Identificarnos educadamente ante el API público
        headers: { "User-Agent": "pulzar-inventory/1.0 (+https://pulzar.app)" },
        // Evitar cache agresivo en edge
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

  // Books providers (sin API key): OpenLibrary primero, Google Books como fallback
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
      mapped: {
        name: title,
        description: description || publishers,
        brand: publishers,
        imageUrl,
        quantity: undefined,
        categories: subjects,
      },
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
    // 1) OpenLibrary
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

    // 2) Google Books fallback
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

  async function lookupProductByBarcode(barcode: string, info: { scheme: "EAN13" | "EAN8" | "NUMERIC"; isValid: boolean }): Promise<ExternalProduct> {
    if (info.scheme === "EAN13" && isIsbn13FromEan13(barcode)) {
      return await lookupBookByISBN(barcode)
    }
    return await lookupOpenFoodFactsProduct(barcode)
  }

  async function mergeContent(patch: (current: any) => any) {
    const res = await db.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
    const existing: any = (res as any).events?.[0]
    const currentContent = existing?.content ?? {}
    const nextContent = patch(currentContent)
    await db.transact([db.tx.events[eventId].update({ content: nextContent })])
  }
  try {
    const info = classifyBarcode(raw)
    await mergeContent((current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        barcode: {
          value: raw,
          scheme: info.scheme,
          valid: info.isValid,
        },
      },
    }))

    // Ensure barcode entity and link with an item
    const now = new Date().toISOString()
    // 1) buscar si existe barcode
    const qr = await db.query({
      barcodes: {
        $: { where: { code: raw }, limit: 1 },
        item: {},
      }
    })
    const existingBarcode: any = (qr as any).barcodes?.[0]
    let barcodeId = existingBarcode?.id as string | undefined

    if (!barcodeId) {
      barcodeId = crypto.randomUUID()
      const info = classifyBarcode(raw)
      await db.transact([
        db.tx.barcodes[barcodeId].create({ code: raw, scheme: info.scheme, createdAt: now }),
        db.tx.organizations[lookup("clerkOrgId", orgId)].link({
          barcodes: barcodeId,
        }),
      ])
    }

    // 2) si el barcode ya está vinculado a un item, obtenerlo
    let itemId: string | undefined = existingBarcode?.item?.id
    if (!itemId) {
      // crear item vacío
      itemId = crypto.randomUUID()
      await db.transact([
        db.tx.items[itemId].create({
          name: "",
          description: "",
          price: 0,
          sku: "",
          status: "pending",
          stock: 0,
          createdAt: now,
          updatedAt: now,
        }),
        db.tx.items[itemId].link({
          barcodes: barcodeId,
        }),
        db.tx.organizations[lookup("clerkOrgId", orgId)].link({
          items: itemId,
        }),
      ])
    }

    // 3) Guardar referencia rápida en analysis
    await mergeContent((current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        resolved: {
          barcodeId,
          itemId,
        },
      },
    }))

    // 4) Lookup externo por código de barras y actualización del item con la información obtenida
    let external = await lookupProductByBarcode(raw, info)

    // Fallback con AI si no encontramos en proveedores conocidos
    async function aiFallback(barcode: string): Promise<ExternalProduct> {
      try {
        const systemInstruction = `Eres un asistente que genera un esquema JSON ESTRICTO para un producto identificado por un código de barras. 
Devuelve SOLO JSON válido con estas claves: name, description, brand, imageUrl, quantity, categories. 
Si una clave no aplica o no se conoce, usa null. No incluyas texto adicional.`
        const userPrompt = `Dado el código de barras: ${barcode}\n\nObjetivo: Genera un JSON estrictamente con estas claves y valores string o null:\n{
  "name": string | null,
  "description": string | null,
  "brand": string | null,
  "imageUrl": string | null,
  "quantity": string | null,
  "categories": string | null
}\n\nNo agregues comentarios ni texto fuera del JSON.`
        const result = await streamText({
          model: 'openai/gpt-oss-120b',
          system: systemInstruction,
          prompt: userPrompt,
        })
        let full = ""
        for await (const chunk of result.textStream) {
          full += chunk
        }
        // Intentar extraer el primer bloque JSON válido
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

    // Tool de búsqueda web con Exa para IA
    async function aiWebSearchWithTools(barcode: string): Promise<ExternalProduct> {
      try {
        const apiKey = process.env.EXA_API_KEY || process.env.NEXT_PUBLIC_EXA_API_KEY
        if (!apiKey) return null
        const exa = new Exa(apiKey)

        // 1) Búsqueda limpia inicial con Exa
        const initial = await exa.search(`barcode ${barcode}`, {
          numResults: 5, 
          type: "keyword"
        })

        // 2) Definir tool para que la IA pueda seguir consultando Exa
        const tools: any = {
          exaSearch: {
            description: "Realiza búsqueda web y devuelve resultados asociados.",
            parameters: z.object({
              query: z.string().min(1),
              numResults: z.number().int().min(1).max(8).optional().default(5),
            }),
            execute: async ({ query, numResults }: { query: string; numResults?: number }) => {
              const r = await exa.search(query, { numResults: Math.min(Math.max(numResults ?? 5, 1), 8) })
              return {
                results: (r?.results ?? []).map((it: any) => ({ title: it.title, url: it.url, id: it.id })),
              }
            },
          },
        }

        // 3) Orquestación con IA para producir el JSON final
        const system = `Eres un asistente investigador. Puedes usar la tool exaSearch para refinar la búsqueda.\n` +
          `Tu salida FINAL debe ser SOLO un JSON válido con las claves: name, description, brand, imageUrl, quantity, categories.`

        const initialSummary = JSON.stringify({
          initialResults: (initial?.results ?? []).map((r: any) => ({ title: r.title, url: r.url })),
        })

        const prompt = `Código de barras: ${barcode}\n` +
          `Tarea: Busca en la web información del producto. Puedes llamar exaSearch tantas veces como necesites.\n` +
          `Cuando termines, responde SOLO con este JSON (strings o null):\n` +
          `{"name": string|null, "description": string|null, "brand": string|null, "imageUrl": string|null, "quantity": string|null, "categories": string|null}\n` +
          `Contexto inicial: ${initialSummary}`

        const result = await streamText({
          model: 'openai/gpt-oss-120b',
          system,
          prompt,
          tools,
        })

        let full = ""
        for await (const chunk of result.textStream) {
          full += chunk
        }
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

    if (!external) {
      // Intentar con web search tool primero; si falla, caer al AI simple
      external = await aiWebSearchWithTools(raw)
      if (!external) {
        external = await aiFallback(raw)
      }
    }

    // Actualizar el item con la info obtenida (solo completa campos vacíos)
    try {
      if (itemId && external?.mapped) {
        const ir = await db.query({ items: { $: { where: { id: itemId }, limit: 1 } } })
        const currentItem: any = (ir as any).items?.[0]
        if (currentItem) {
          const itemUpdate: any = {}
          const mapped = external.mapped

          const currentName: string = currentItem.name ?? ""
          const currentDescription: string = currentItem.description ?? ""
          const currentSku: string = currentItem.sku ?? ""

          if (mapped.name && (!currentName || currentName.trim() === "")) {
            itemUpdate.name = mapped.name
          }
          if (mapped.description && (!currentDescription || currentDescription.trim() === "")) {
            itemUpdate.description = mapped.description
          }
          if (!currentSku || currentSku.trim() === "") {
            itemUpdate.sku = raw
          }

          if (Object.keys(itemUpdate).length > 0) {
            itemUpdate.updatedAt = new Date().toISOString()
            await db.transact([db.tx.items[itemId].update(itemUpdate)])
          }
        }
      }
    } catch (_) {
      // Evitar que un fallo de enriquecimiento bloquee el flujo principal
    }
    await mergeContent((current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        productLookup: external
          ? {
            ok: true,
            provider: external.source,
            fetchedAt: new Date().toISOString(),
            mapped: external.mapped,
            raw: external.raw,
          }
          : {
            ok: false,
            provider: "ai",
            fetchedAt: new Date().toISOString(),
          },
      },
    }))
  } catch (error) {
    console.error("runBarcodeAnalysis error", error)
  }
}


