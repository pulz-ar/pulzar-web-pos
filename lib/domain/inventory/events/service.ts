"use server"

import { init, lookup } from "@instantdb/admin"
import schema from "@inventory/instant.schema"
import { after } from "next/server"
import { runIdentifierAnalysis } from "@/lib/domain/inventory/identifiers/service"
import { runUrlAnalysis } from "@/lib/domain/inventory/url/service"

type SubmitResult = { ok: true; eventId: string } | { ok: false; error: string }

function normalizeScannedInput(input: string): string {
  return input
    .trim()
    .replace(/Ñ--/g, "://")
    .replace(/Ñ-/g, ":/")
    .replace(/Ñ/g, ":")
}

async function mergeEventContent(scopedDb: any, eventId: string, patch: (current: any) => any) {
  const res = await scopedDb.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
  const current = res.events?.[0]?.content ?? {}
  const nextContent = patch(current)
  await scopedDb.transact([scopedDb.tx.events[eventId].update({ content: nextContent })])
}

export async function submitBarcodeService(params: { userEmail: string; orgId?: string; userId?: string; barcode: string; eventId: string }): Promise<SubmitResult> {
  try {
    const { userEmail, orgId, userId, barcode, eventId } = params
    if (!barcode || barcode.trim().length === 0) {
      return { ok: false, error: "Código de barras inválido" }
    }

    const normalized = normalizeScannedInput(barcode)

    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN

    if (!appId || !adminToken) {
      console.error("Faltan variables de entorno para InstantDB")
      return { ok: false, error: "Configuración del backend incompleta" }
    }

    const db = init({ appId, adminToken, schema })
    const scopedDb = db.asUser({ email: userEmail })

    // 1) Crear evento sincronamente para que el hook lo vea
    await scopedDb.transact([
      scopedDb.tx.events[eventId].create({
        type: "scanner.read",
        content: {
          status: "created",
          payload: { raw: normalized },
          userId: userId ?? null,
        },
        createdAt: new Date().toISOString(),
      }),
      scopedDb.tx.organizations[lookup("clerkOrgId", orgId)].link({ events: eventId }),
    ])

    // Fast-path: si ya existe el identifier en esta organización, asociar item inmediatamente
    try {
      const isNumeric = /^\d{8,}$/.test(normalized)
      if (isNumeric) {
        const qr = await scopedDb.query({
          identifiers: {
            $: { where: { value: normalized }, limit: 1 },
            item: { $: { fields: ["id"] } },
          },
        } as any)
        const idf: any = (qr as any)?.identifiers?.[0]
        if (idf?.id) {
          const nextContent = (current: any) => ({
            ...current,
            analysis: {
              ...(current.analysis ?? {}),
              identifier: { value: normalized, type: "OTHER", valid: true },
              resolved: { identifierId: idf.id, itemId: idf.item?.id },
            },
          })
          await mergeEventContent(scopedDb, eventId, nextContent)
        }
      }
    } catch { }

    // 2) Workflow async: procesamiento, análisis y enriquecimiento
    after((async () => {
      try {
        // status -> processing
        await mergeEventContent(scopedDb, eventId, (current) => ({ ...current, status: "processing" }))

        // determinar tipo en backend
        const raw = normalized
        const isUrl = /^(https?:\/\/)/i.test(raw)
        const isNumeric = /^\d{8,}$/.test(raw)
        let detected: "barcode" | "url" | "unknown" = "unknown"
        if (isUrl) detected = "url"
        else if (isNumeric) detected = "barcode"

        await mergeEventContent(scopedDb, eventId, (current) => {
          const existingPayload = current?.payload ?? {}
          const typedPatch = detected === "barcode" ? { identifier: raw } : detected === "url" ? { url: raw } : {}
          return { ...current, type: detected, payload: { ...existingPayload, ...typedPatch } }
        })

        // Branch por tipo
        if (detected === "barcode") {
          await runIdentifierAnalysis({ eventId, raw, orgId: orgId ?? undefined, userEmail })
        } else if (detected === "url") {
          await runUrlAnalysis({ eventId, raw, userEmail })
        }

        // finalizar
        await mergeEventContent(scopedDb, eventId, (current) => ({ ...current, status: "done" }))
      } catch (e) {
        console.error("workflow error", e)
        try {
          await mergeEventContent(scopedDb, eventId, (current) => ({ ...current, status: "error" }))
        } catch { }
      }
    }))

    return { ok: true, eventId }
  } catch (error) {
    console.error("Error en submitBarcode:", error)
    const message = error instanceof Error ? error.message : "Error desconocido"
    return { ok: false, error: message }
  }
}


