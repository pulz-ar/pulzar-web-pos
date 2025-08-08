"use server"

import { init, lookup } from "@instantdb/admin"
import schema from "@inventory/instant.schema"

export async function runUrlAnalysis(params: {
  appId: string
  adminToken: string
  eventId: string
  raw: string
  orgId?: string
}) {
  const { appId, adminToken, eventId, raw } = params
  const db = init({ appId, adminToken, schema })

  function normalizeUrl(url: string): string {
    try {
      // Intenta construir una URL; si no tiene protocolo, asume http
      const u = new URL(url.startsWith("http") ? url : `https://${url}`)
      return u.toString()
    } catch {
      return url
    }
  }

  async function mergeContent(patch: (current: any) => any) {
    const res = await db.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
    const existing: any = res.events?.[0]
    const currentContent = existing?.content ?? {}
    const nextContent = patch(currentContent)
    await db.transact([db.tx.events[eventId].update({ content: nextContent })])
  }

  try {
    const normalized = normalizeUrl(raw)
    await mergeContent((current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        url: {
          value: normalized,
          original: raw,
        },
      },
    }))
  } catch (error) {
    console.error("runUrlAnalysis error", error)
  }
}


