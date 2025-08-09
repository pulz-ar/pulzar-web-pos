import { id, lookup } from "@instantdb/admin"

export type ActionResult = { ok: true } | { ok: false; error: string }

export class ItemsService {
  private adminDb: any
  private scopedDb: any

  constructor(params: { adminDb: any; scopedDb: any }) {
    this.adminDb = params.adminDb
    this.scopedDb = params.scopedDb
  }

  async unlinkItemFromIdentifier(params: { identifierId: string }): Promise<ActionResult> {
    try {
      const { identifierId } = params
      if (!identifierId) return { ok: false, error: "identifierId requerido" }

      const qr = await this.scopedDb.query({
        identifiers: { $: { where: { id: identifierId }, limit: 1 }, item: {} },
      } as any)
      const idf: any = (qr as any).identifiers?.[0]
      const itemId: string | undefined = idf?.item?.id
      if (!itemId) return { ok: true }
      await this.scopedDb.transact([this.scopedDb.tx.items[itemId].unlink({ identifiers: identifierId })])
      return { ok: true }
    } catch (e) {
      console.error("unlinkItemFromIdentifier error", e)
      return { ok: false, error: "No se pudo desvincular" }
    }
  }

  async createItemForIdentifier(params: { identifierId: string; orgId?: string }): Promise<
    | { ok: true; itemId: string }
    | { ok: false; error: string }
  > {
    try {
      const { identifierId, orgId } = params
      if (!identifierId) return { ok: false, error: "identifierId requerido" }
      const now = new Date().toISOString()
      const itemId = id()
      await this.scopedDb.transact([
        this.scopedDb.tx.items[itemId].create({
          name: "",
          description: "",
          price: 0,
          sku: "",
          status: "pending",
          stock: 0,
          createdAt: now,
          updatedAt: now,
        }),
        this.scopedDb.tx.items[itemId].link({ identifiers: identifierId }),
        this.scopedDb.tx.organizations[lookup("clerkOrgId", orgId)].link({ items: itemId }),
      ])
      return { ok: true, itemId }
    } catch (e) {
      console.error("createItemForIdentifier error", e)
      return { ok: false, error: "No se pudo crear el item" }
    }
  }

  async updateItemFields(params: {
    itemId: string
    updates: Partial<{ name: string; description: string; price: number; sku: string; status: string; stock: number }>
  }): Promise<ActionResult> {
    try {
      const { itemId, updates } = params
      if (!itemId) return { ok: false, error: "itemId requerido" }
      const payload: any = { ...updates, updatedAt: new Date().toISOString() }
      await this.scopedDb.transact([this.scopedDb.tx.items[itemId].update(payload)])
      return { ok: true }
    } catch (e) {
      console.error("updateItemFields error", e)
      return { ok: false, error: "No se pudo actualizar el item" }
    }
  }

  async uploadItemAttachments(params: {
    itemId: string
    files: Array<{ filename: string; base64: string; contentType?: string }>
    title?: string
    kind?: string
    orgId?: string
  }): Promise<ActionResult> {
    try {
      const { itemId, files, title, kind, orgId } = params
      if (!itemId || !files?.length) return { ok: false, error: "Parámetros inválidos" }

      for (const f of files) {
        const now = new Date().toISOString()
        const attachmentId = id()
        await this.scopedDb.transact([
          this.scopedDb.tx.attachments[attachmentId].create({ createdAt: now, kind: kind || "image", title: (title || null) as any }),
          this.scopedDb.tx.items[itemId].link({ attachments: attachmentId }),
        ])

        const safeName = encodeURIComponent(f.filename)
        const orgSegment = encodeURIComponent(orgId || "unknown-org")
        const path = `organization/${orgSegment}/item/${attachmentId}/${Date.now()}-${safeName}`
        const buffer = Buffer.from(f.base64, "base64")
        const { data: { id: fileId } } = await this.adminDb.storage.uploadFile(path, buffer, { contentType: f.contentType || "application/octet-stream" })
        await this.scopedDb.transact([this.scopedDb.tx.$files[fileId].link({ attachment: attachmentId })])
      }
      return { ok: true }
    } catch (e) {
      console.error("uploadItemAttachments error", e)
      return { ok: false, error: "No se pudieron subir los adjuntos" }
    }
  }

  async deleteItemAttachment(params: { attachmentId: string }): Promise<ActionResult> {
    try {
      const { attachmentId } = params
      if (!attachmentId) return { ok: false, error: "attachmentId requerido" }

      const qr = await this.scopedDb.query({
        attachments: { $: { where: { id: attachmentId }, limit: 1 }, $files: { $: { fields: ["id", "path"] } }, item: { $: { fields: ["id"] } } },
      } as any)
      const att = (qr as any)?.attachments?.[0]
      const files = (att?.$files ?? []) as Array<{ id: string; path: string }>

      await this.scopedDb.transact([this.scopedDb.tx.attachments[attachmentId].delete()])
      if (files.length) {
        await this.adminDb.storage.deleteMany(files.map((f) => f.path))
      }
      return { ok: true }
    } catch (e) {
      console.error("deleteItemAttachment error", e)
      return { ok: false, error: "No se pudo borrar el adjunto" }
    }
  }

  async markAttachmentPrimary(params: { itemId: string; attachmentId: string }): Promise<ActionResult> {
    try {
      const { itemId, attachmentId } = params
      if (!itemId || !attachmentId) return { ok: false, error: "Parámetros inválidos" }
      const qr = await this.scopedDb.query({
        items: { $: { where: { id: itemId }, limit: 1 }, attachments: { $: { fields: ["id", "isPrimary"] } } },
      } as any)
      const all = (qr as any)?.items?.[0]?.attachments ?? []
      const txs: any[] = []
      for (const a of all) {
        txs.push(this.scopedDb.tx.attachments[a.id].update({ isPrimary: a.id === attachmentId }))
      }
      if (txs.length) await this.scopedDb.transact(txs)
      return { ok: true }
    } catch (e) {
      console.error("markAttachmentPrimary error", e)
      return { ok: false, error: "No se pudo marcar como principal" }
    }
  }
}


