"use server"

import { init } from "@instantdb/admin"
import { auth } from "@clerk/nextjs/server"
import schema from "@inventory/instant.schema"
import { OrdersService } from "@/lib/domain/orders/service"

export async function upsertOpenOrder(): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const { sessionClaims, orgId } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new OrdersService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  const res = await service.upsertOpenOrder({ orgId: orgId ?? undefined })
  return res.ok ? { ok: true, orderId: res.data.orderId } : { ok: false, error: res.error }
}

export async function addScanToOrder(params: { orderId: string; scanned: string }): Promise<{ ok: true; lineId: string; itemId: string } | { ok: false; error: string }> {
  const { sessionClaims } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new OrdersService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  const res = await service.addScanToOrder(params)
  return res.ok ? { ok: true, lineId: res.data.lineId, itemId: res.data.itemId } : { ok: false, error: res.error }
}


