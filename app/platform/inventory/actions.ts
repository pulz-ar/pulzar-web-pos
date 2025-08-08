"use server"

import { id, init, lookup } from "@instantdb/admin"
import { auth } from "@clerk/nextjs/server"
import schema from "@inventory/instant.schema"
import { runBarcodeAnalysis } from "./barcode-analysis"
import { runUrlAnalysis } from "./url-analysis"
import { after } from "next/server"

type SubmitResult = { ok: true } | { ok: false; error: string }

export async function submitBarcode(barcode: string): Promise<SubmitResult> {
  try {
    if (!barcode || barcode.trim().length === 0) {
      return { ok: false, error: "Código de barras inválido" }
    }

    const { userId, orgId } = await auth()

    function normalizeScannedInput(input: string): string {
      return input
        .trim()
        // Corrige patrón común de QR escaneado en ciertos teclados: "Ñ--" → "://"
        .replace(/Ñ--/g, "://")
        .replace(/Ñ-/g, ":/")
        .replace(/Ñ/g, ":")
    }
    const normalized = normalizeScannedInput(barcode)

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN

    if (!appId || !adminToken) {
      console.error("Faltan variables de entorno para InstantDB")
      return { ok: false, error: "Configuración del backend incompleta" }
    }

    const db = init({ appId, adminToken, schema })

    const eventId = id()
    await db.transact([
      db.tx.events[eventId].create({
        type: "scanner.read",
        content: {
          status: "created",
          payload: { raw: normalized },
          userId: userId ?? null,
        },
        createdAt: new Date().toISOString(),
      }),
      db.tx.organizations[lookup("clerkOrgId", orgId)].link({
        events: eventId,
      }),
    ])

    // Async workflow (no bloquear la respuesta):
    after((async () => {
      try {
        // helper para mergear content sin perder campos
        async function mergeContent(patch: (current: any) => any) {
          const res = await db.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
          const current = res.events?.[0]?.content ?? {}
          const nextContent = patch(current)
          await db.transact([db.tx.events[eventId].update({ content: nextContent })])
        }

        // 1) status -> processing
        await mergeContent((current) => ({ ...current, status: "processing" }))

        // 2) determinar tipo en backend
        const raw = normalized
        const isUrl = /^(https?:\/\/)/i.test(raw)
        const isNumeric = /^\d{8,}$/.test(raw)
        let detected: "barcode" | "url" | "unknown" = "unknown"
        if (isUrl) detected = "url"
        else if (isNumeric) detected = "barcode"

        await mergeContent((current) => {
          const existingPayload = current?.payload ?? {}
          const typedPatch = detected === "barcode" ? { barcode: raw } : detected === "url" ? { url: raw } : {}
          return {
            ...current,
            type: detected,
            payload: { ...existingPayload, ...typedPatch },
          }
        })

        // 3) Branch por tipo
        if (detected === "barcode") {
          await runBarcodeAnalysis({ appId, adminToken, eventId, raw, orgId: orgId ?? undefined })
        } else if (detected === "url") {
          await runUrlAnalysis({ appId, adminToken, eventId, raw, orgId: orgId ?? undefined })
        }

        // finalizar (opcional):
        await mergeContent((current) => ({ ...current, status: "done" }))
      } catch (e) {
        console.error("workflow error", e)
        try {
          const res = await db.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
          const current: any = res.events?.[0]?.content ?? {}
          await db.transact([db.tx.events[eventId].update({ content: { ...current, status: "error" } })])
        } catch {}
      }
    }))

    return { ok: true }
  } catch (error) {
    console.error("Error en submitBarcode:", error)
    const message = error instanceof Error ? error.message : "Error desconocido"
    return { ok: false, error: message }
  }
}


type ActionResult = { ok: true } | { ok: false; error: string }

export async function unlinkItemFromBarcode(params: { barcodeId: string }): Promise<ActionResult> {
  "use server"
  try {
    const { barcodeId } = params
    if (!barcodeId) return { ok: false, error: "barcodeId requerido" }

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN
    if (!appId || !adminToken) return { ok: false, error: "Config InstantDB incompleta" }

    const db = init({ appId, adminToken, schema })

    // Obtener item asociado (reverse one link)
    const qr = await db.query({
      barcodes: {
        $: { where: { id: barcodeId }, limit: 1 },
        item: {},
      },
    })
    const bc: any = (qr as any).barcodes?.[0]
    const itemId: string | undefined = bc?.item?.id

    if (!itemId) {
      // Nada que desvincular
      return { ok: true }
    }

    await db.transact([
      // Unlink: remover la relación items<->barcodes
      db.tx.items[itemId].unlink({ barcodes: barcodeId }),
    ])

    return { ok: true }
  } catch (e) {
    console.error("unlinkItemFromBarcode error", e)
    return { ok: false, error: "No se pudo desvincular" }
  }
}

export async function createItemForBarcode(params: { barcodeId: string }): Promise<
  | { ok: true; itemId: string }
  | { ok: false; error: string }
> {
  "use server"
  try {
    const { barcodeId } = params
    if (!barcodeId) return { ok: false, error: "barcodeId requerido" }

    const { orgId } = await auth()
    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN
    if (!appId || !adminToken) return { ok: false, error: "Config InstantDB incompleta" }

    const db = init({ appId, adminToken, schema })
    const now = new Date().toISOString()

    const itemId = id()
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
      db.tx.items[itemId].link({ barcodes: barcodeId }),
      db.tx.organizations[lookup("clerkOrgId", orgId)].link({ items: itemId }),
    ])

    return { ok: true, itemId }
  } catch (e) {
    console.error("createItemForBarcode error", e)
    return { ok: false, error: "No se pudo crear el item" }
  }
}

export async function updateItemFields(params: {
  itemId: string
  updates: Partial<{ name: string; description: string; price: number; sku: string; status: string; stock: number }>
}): Promise<ActionResult> {
  "use server"
  try {
    const { itemId, updates } = params
    if (!itemId) return { ok: false, error: "itemId requerido" }

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN
    if (!appId || !adminToken) return { ok: false, error: "Config InstantDB incompleta" }
    const db = init({ appId, adminToken, schema })

    const payload: any = { ...updates, updatedAt: new Date().toISOString() }
    await db.transact([db.tx.items[itemId].update(payload)])
    return { ok: true }
  } catch (e) {
    console.error("updateItemFields error", e)
    return { ok: false, error: "No se pudo actualizar el item" }
  }
}

export async function uploadItemImages(params: {
  itemId: string
  files: Array<{ path: string; base64: string; contentType?: string; contentDisposition?: string }>
}): Promise<ActionResult> {
  "use server"
  try {
    const { itemId, files } = params
    if (!itemId || !files?.length) return { ok: false, error: "Parámetros inválidos" }

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
    if (!appId || !adminToken) return { ok: false, error: "Config InstantDB incompleta" }
    const db = init({ appId, adminToken, schema })

    // Subir y vincular cada archivo al item via reverse link ($files -> item)
    for (const f of files) {
      const { path, base64, contentType, contentDisposition } = f
      // base64 seguro desde el cliente (sin data: prefix)
      const buffer = Buffer.from(base64, "base64")
      await db.storage.upload(path, buffer, {
        contentType: contentType || "application/octet-stream",
        contentDisposition: contentDisposition || "inline",
      })
    }

    // Obtener los $files subidos por path y linkearlos
    const qr = await db.query({
      $files: { $: { where: { path: { $in: files.map((x) => x.path) } } } },
    })

    const txs = qr.$files.map((file: any) => db.tx.$files[file.id].link({ item: itemId }))
    if (txs.length) {
      await db.transact(txs)
    }
    return { ok: true }
  } catch (e) {
    console.error("uploadItemImages error", e)
    return { ok: false, error: "No se pudieron subir las imágenes" }
  }
}


