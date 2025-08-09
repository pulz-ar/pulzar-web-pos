"use server"

import { init } from "@instantdb/admin"
import { auth } from "@clerk/nextjs/server"
import schema from "@inventory/instant.schema"
import { ItemsService } from "@/lib/domain/inventory/items/service"
import { submitBarcodeService } from "@/lib/domain/inventory/events/service"

type SubmitResult = { ok: true; eventId: string } | { ok: false; error: string }

export async function submitBarcode(barcode: string, eventId: string): Promise<SubmitResult> {
  const { sessionClaims, orgId, userId } = await auth()
  const userEmail = (sessionClaims as any)?.email as string
  return submitBarcodeService({ userEmail, orgId: orgId ?? undefined, userId: userId ?? undefined, barcode, eventId })
}


type ActionResult = { ok: true } | { ok: false; error: string }

export async function unlinkItemFromIdentifier(params: { identifierId: string }): Promise<ActionResult> {
  const { sessionClaims } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.unlinkItemFromIdentifier(params)
}

export async function createItemForIdentifier(params: { identifierId: string }): Promise<
  | { ok: true; itemId: string }
  | { ok: false; error: string }
> {
  const { sessionClaims, orgId } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.createItemForIdentifier({ identifierId: params.identifierId, orgId: orgId ?? undefined })
}

export async function updateItemFields(params: {
  itemId: string
  updates: Partial<{ name: string; description: string; price: number; sku: string; status: string; stock: number }>
}): Promise<ActionResult> {
  const { sessionClaims } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.updateItemFields(params)
}

// Mantener firma pública usada por el cliente pero delegar a adjuntos genéricos
export async function uploadItemImages(params: {
  itemId: string
  files: Array<{ path: string; base64: string; contentType?: string; contentDisposition?: string }>
}): Promise<ActionResult> {
  // Esta ruta se mantenía para path basado en storage directo; migrado a attachments
  // Por compat, tomamos solo filename y contentType, ignorando path/contentDisposition
  const { sessionClaims, orgId } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  const files = params.files.map((f) => ({ filename: f.path.split('/').pop() || 'image', base64: f.base64, contentType: f.contentType }))
  return service.uploadItemAttachments({ itemId: params.itemId, files, kind: "image", orgId: orgId ?? undefined })
}


export async function uploadItemAttachments(params: {
  itemId: string
  files: Array<{ filename: string; base64: string; contentType?: string }>
  title?: string
  kind?: string
}): Promise<ActionResult> {
  const { sessionClaims, orgId } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.uploadItemAttachments({ ...params, orgId: orgId ?? undefined })
}


export async function deleteItemAttachment(params: { attachmentId: string }): Promise<ActionResult> {
  const { sessionClaims } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.deleteItemAttachment(params)
}

export async function markAttachmentPrimary(params: { itemId: string; attachmentId: string }): Promise<ActionResult> {
  const { sessionClaims } = await auth()
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
  const db = init({ appId, adminToken, schema })
  const userEmail = (sessionClaims as any)?.email as string
  const service = new ItemsService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  return service.markAttachmentPrimary(params)
}


