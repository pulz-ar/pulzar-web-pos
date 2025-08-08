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


