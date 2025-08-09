import { init, lookup, id } from "@instantdb/admin"
import schema from "@inventory/instant.schema"
import { auth } from "@clerk/nextjs/server"

export type ServiceResult<T = any> = { ok: true; data: T } | { ok: false; error: string }

export class OrdersService {
  private adminDb: any
  private scopedDb: any

  constructor(params: { adminDb: any; scopedDb: any }) {
    this.adminDb = params.adminDb
    this.scopedDb = params.scopedDb
  }

  static async fromAuth(): Promise<OrdersService> {
    const { sessionClaims } = await auth()
    const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID as string
    const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN as string
    const db = init({ appId, adminToken, schema })
    const userEmail = (sessionClaims as any)?.email as string
    return new OrdersService({ adminDb: db, scopedDb: db.asUser({ email: userEmail }) })
  }

  async upsertOpenOrder(params: { orgId?: string }): Promise<ServiceResult<{ orderId: string }>> {
    try {
      const { orgId } = params
      const now = new Date().toISOString()
      // Buscar orden "open" más reciente
      const qr = await this.scopedDb.query({ orders: { $: { where: { status: "open" }, limit: 1, order: { createdAt: "desc" } } } })
      const existing = (qr as any)?.orders?.[0]
      if (existing?.id) return { ok: true, data: { orderId: existing.id } }
      const orderId = id()
      await this.scopedDb.transact([
        this.scopedDb.tx.orders[orderId].create({ status: "open", total: 0, createdAt: now, updatedAt: now }),
        this.scopedDb.tx.organizations[lookup("clerkOrgId", orgId)].link({ orders: orderId }),
      ])
      return { ok: true, data: { orderId } }
    } catch (e) {
      console.error("upsertOpenOrder error", e)
      return { ok: false, error: "No se pudo crear/recuperar la orden" }
    }
  }

  async addScanToOrder(params: { orderId: string; scanned: string }): Promise<ServiceResult<{ lineId: string; itemId: string }>> {
    try {
      const { orderId, scanned } = params
      const normalized = scanned.trim()
      if (!normalized) return { ok: false, error: "Valor de escaneo inválido" }

      // Resolver item: por identifiers, barcodes o sku
      const qr = await this.scopedDb.query({
        identifiers: { $: { where: { value: normalized }, limit: 1 }, item: { $: { fields: ["id", "price"] } } },
        barcodes: { $: { where: { code: normalized }, limit: 1 }, item: { $: { fields: ["id", "price"] } } },
        items: { $: { where: { sku: normalized }, limit: 1, fields: ["id", "price"] } },
      } as any)
      const idfItem: any = (qr as any)?.identifiers?.[0]?.item
      const bcItem: any = (qr as any)?.barcodes?.[0]?.item
      const skuItem: any = (qr as any)?.items?.[0]
      const target = idfItem || bcItem || skuItem
      if (!target?.id) return { ok: false, error: "No se encontró item para el código escaneado" }

      const now = new Date().toISOString()
      const lineId = id()
      const price = typeof target.price === "number" ? target.price : 0
      const quantity = 1
      const total = price * quantity

      // Agregar línea y actualizar totales de la orden
      await this.scopedDb.transact([
        this.scopedDb.tx.orderLines[lineId].create({ createdAt: now, updatedAt: now, quantity, price, total }),
        this.scopedDb.tx.orders[orderId].link({ orderLines: lineId }),
        this.scopedDb.tx.orderLines[lineId].link({ item: target.id }),
      ])

      // Recalcular total de orden (simple: sumar línea creada)
      await this.scopedDb.transact([
        this.scopedDb.tx.orders[orderId].update({ total: { $inc: total }, updatedAt: now })
      ])

      return { ok: true, data: { lineId, itemId: target.id } }
    } catch (e) {
      console.error("addScanToOrder error", e)
      return { ok: false, error: "No se pudo agregar a la orden" }
    }
  }
}


