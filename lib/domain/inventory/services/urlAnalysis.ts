"use server"

import { init } from "@instantdb/admin"
import schema from "@inventory/instant.schema"

// Helpers
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.toString()
  } catch {
    return url
  }
}

async function mergeEventContent(scopedDb: any, eventId: string, patch: (current: any) => any) {
  const res = await scopedDb.query({ events: { $: { where: { id: eventId }, limit: 1 } } })
  const existing: any = res.events?.[0]
  const currentContent = existing?.content ?? {}
  const nextContent = patch(currentContent)
  await scopedDb.transact([scopedDb.tx.events[eventId].update({ content: nextContent })])
}

export async function runUrlAnalysis(params: { userEmail: string; eventId: string; raw: string }) {
  const { userEmail, eventId, raw } = params
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const scopedDb = db.asUser({ email: userEmail })

  try {
    const normalized = normalizeUrl(raw)
    await mergeEventContent(scopedDb, eventId, (current) => ({
      ...current,
      analysis: {
        ...(current.analysis ?? {}),
        url: { value: normalized, original: raw },
      },
    }))
  } catch (error) {
    console.error("runUrlAnalysis error", error)
  }
}


