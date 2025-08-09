"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { init } from "@instantdb/react"
import { useOrganization } from "@clerk/nextjs"

const db = init({ appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID! })

type ItemBase = {
  id: string
  name?: string
  description?: string
  sku?: string
  price?: number
  stock?: number
  status?: string
  createdAt?: string
  serverCreatedAt?: string | number
}

type OrderLine = {
  id: string
  item: ItemBase
  quantity: number
  price?: number
  total?: number
}

export default function PlatformPage() {
  const [search, setSearch] = useState("")
  const [barcode, setBarcode] = useState("")
  const [scannedValue, setScannedValue] = useState<string | null>(null)
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const lastScanAddedRef = useRef<string | null>(null)
  const lastAddRef = useRef<{ id: string; at: number } | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const { organization } = useOrganization()
  // Observabilidad: mantenemos envío de evento, pero sin suscripción

  // Items base + previews
  const listQuery: any = {
    items: {
      $: {
        limit: 120,
        order: { serverCreatedAt: "desc" as const },
        fields: ["name", "description", "sku", "price", "stock", "status", "createdAt"],
      },
      identifiers: { $: { fields: ["value"] } },
      barcodes: { $: { fields: ["code"] } },
      attachments: { $: { fields: ["id", "isPrimary"] }, $files: {} },
      $files: {},
    },
  }
  const { isLoading: isLoadingList, data: listData } = db.useQuery(listQuery)
  const items = (listData?.items ?? []) as ItemBase[]

  // Resolver matches por scan: identifiers, barcodes, y coincidencia directa por sku
  function normalizeScannedInput(input: string): string {
    return input.trim().replace(/Ñ--/g, "://").replace(/Ñ-/g, ":/").replace(/Ñ/g, ":")
  }

  function getItemMatchesForScan(scannedRaw: string): ItemBase[] {
    const norm = normalizeScannedInput(scannedRaw)
    const bySku = items.filter((it: any) => (it?.sku || "") === norm)
    const byIdentifier = items.filter((it: any) => Array.isArray(it?.identifiers) && it.identifiers.some((idf: any) => idf?.value === norm))
    const byBarcode = items.filter((it: any) => Array.isArray(it?.barcodes) && it.barcodes.some((bc: any) => bc?.code === norm))
    const unionMap = new Map<string, ItemBase>()
    for (const it of [...bySku, ...byIdentifier, ...byBarcode]) unionMap.set(it.id, it as ItemBase)
    return Array.from(unionMap.values())
  }

  const matchedItemIds: Set<string> = useMemo(() => {
    if (!scannedValue) return new Set()
    const m = getItemMatchesForScan(scannedValue)
    return new Set(m.map((x) => x.id))
  }, [scannedValue, items])

  // Suscripción a la orden actual y sus líneas (solo lectura)
  const orderQuery: any = orderId
    ? {
        orders: {
          $: { where: { id: orderId }, limit: 1, fields: ["total", "updatedAt", "createdAt"] },
          orderLines: {
            $: { fields: ["id", "quantity", "price", "total"] },
            item: { $: { fields: ["id", "name", "sku", "price", "status"] } },
          },
        },
      }
    : null
  const { data: orderData, isLoading: isLoadingOrder } = db.useQuery(orderQuery as any)
  const orderRecord: any = (orderData as any)?.orders?.[0] || null
  const orderLines: OrderLine[] = Array.isArray(orderRecord?.orderLines)
    ? orderRecord.orderLines.map((l: any) => ({ id: l.id, item: l.item, quantity: l.quantity, price: l.price, total: l.total }))
    : []
  const orderTotalNumber: number = typeof orderRecord?.total === "number"
    ? orderRecord.total
    : orderLines.reduce((sum, l) => sum + (typeof (l as any).price === 'number' ? (l as any).price : 0) * (l.quantity || 0), 0)

  const filteredItems = useMemo(() => {
    let base = items
    if (scannedValue) {
      base = base.filter((it) => matchedItemIds.has(it.id))
    }
    const term = search.trim().toLowerCase()
    if (term) {
      base = base.filter((it) => (it.name || "").toLowerCase().includes(term) || (it.sku || "").toLowerCase().includes(term))
    }
    return base
  }, [items, matchedItemIds, scannedValue, search])

  // Selección automática del primer ítem filtrado opcionalmente podría aplicarse, pero en POS agregamos directo

  // Captura global de teclado para enrutar al input de scanner (sin efecto acumulado)
  useEffect(() => {
    function isEditableElement(el: Element | null): boolean {
      if (!el) return false
      const tag = (el as HTMLElement).tagName
      const editable = (el as HTMLElement).isContentEditable
      return editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (isEditableElement(active)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length === 1) {
        setBarcode((prev) => prev + e.key)
        scannerInputRef.current?.focus()
        e.preventDefault()
        return
      }
      if (e.key === "Backspace") {
        setBarcode((prev) => prev.slice(0, -1))
        scannerInputRef.current?.focus()
        e.preventDefault()
        return
      }
      if (e.key === "Enter") {
        const form = scannerInputRef.current?.form as HTMLFormElement | undefined
        if (form) {
          if (typeof form.requestSubmit === "function") form.requestSubmit()
          else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
        }
        e.preventDefault()
        return
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])

  async function upsertOpenOrderClient(): Promise<string | null> {
    if (orderId) { console.log('[POS] order: existing', orderId); return orderId }
    try {
      const now = new Date().toISOString()
      const newOrderId = (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      console.log('[POS] order: creating', { newOrderId })
      await (db as any).transact([ (db as any).tx.orders[newOrderId].create({ status: 'open', total: 0, createdAt: now, updatedAt: now }) ])
      setOrderId(newOrderId)
      console.log('[POS] order: created', newOrderId)
      return newOrderId
    } catch (e) {
      console.error('[POS] order: create failed, trying to fetch existing', e)
      try {
        const qr = (await (db as any).query({ orders: { $: { where: { status: 'open' }, limit: 1, order: { createdAt: 'desc' } } } } as any)) as any
        const existing = qr?.orders?.[0]
        if (existing?.id) { setOrderId(existing.id); console.log('[POS] order: found', existing.id); return existing.id }
      } catch (e2) {
        console.error('[POS] order: fetch open failed', e2)
      }
      return null
    }
  }

  async function resolveItemByScan(scannedRaw: string): Promise<ItemBase | null> {
    try {
      const normalized = normalizeScannedInput(scannedRaw)
      console.log('[POS] resolve: query', normalized)
      const qr = (await (db as any).query({
        identifiers: { $: { where: { value: normalized }, limit: 1 }, item: { $: { fields: ["id", "name", "sku", "price", "status"] } } },
        barcodes: { $: { where: { code: normalized }, limit: 1 }, item: { $: { fields: ["id", "name", "sku", "price", "status"] } } },
        items: { $: { where: { sku: normalized }, limit: 1, fields: ["id", "name", "sku", "price", "status"] } },
      } as any)) as any
      const idfItem: ItemBase | undefined = qr?.identifiers?.[0]?.item
      const bcItem: ItemBase | undefined = qr?.barcodes?.[0]?.item
      const skuItem: ItemBase | undefined = qr?.items?.[0]
      const target = (idfItem || bcItem || skuItem) as ItemBase | undefined
      console.log('[POS] resolve: result', target?.id)
      return target ?? null
    } catch (_) {
      console.error('[POS] resolve: error')
      return null
    }
  }

  async function addItemToOrderClient(orderIdParam: string, item: ItemBase, quantity: number = 1): Promise<boolean> {
    try {
      const now = new Date().toISOString()
      const price = typeof item.price === "number" ? item.price : 0
      console.log('[POS] addLine: start', { orderId: orderIdParam, itemId: item.id, price, quantity })
      // Buscar si ya existe una línea para este item en la orden
      const qr = (await (db as any).query({
        orders: {
          $: { where: { id: orderIdParam }, limit: 1 },
          orderLines: { $: { fields: ["id", "quantity", "price", "total"] }, item: { $: { fields: ["id"] } } },
        },
      } as any)) as any
      const ord = qr?.orders?.[0]
      const lines = Array.isArray(ord?.orderLines) ? ord.orderLines : []
      const existingLine = lines.find((l: any) => l?.item?.id === item.id)
      if (existingLine?.id) {
        const newQty = Number(existingLine.quantity || 0) + quantity
        const lineTotalInc = price * quantity
        console.log('[POS] addLine: bump', { lineId: existingLine.id, newQty })
        await (db as any).transact([
          (db as any).tx.orderLines[existingLine.id].update({ quantity: newQty, total: (existingLine.total || 0) + lineTotalInc, updatedAt: now }),
          (db as any).tx.orders[orderIdParam].update({ total: { $inc: lineTotalInc }, updatedAt: now }),
        ])
      } else {
        const lineId = (globalThis as any).crypto?.randomUUID ? (globalThis as any).crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const total = price * quantity
        console.log('[POS] addLine: create', { lineId })
        await (db as any).transact([
          (db as any).tx.orderLines[lineId].create({ createdAt: now, updatedAt: now, quantity, price, total }),
          (db as any).tx.orders[orderIdParam].link({ orderLines: lineId }),
          (db as any).tx.orderLines[lineId].link({ item: item.id }),
          (db as any).tx.orders[orderIdParam].update({ total: { $inc: total }, updatedAt: now }),
        ])
      }
      console.log('[POS] addLine: done')
      return true
    } catch (_) {
      console.error('[POS] addLine: error')
      return false
    }
  }

  async function incrementLine(lineId: string, itemPrice: number) {
    if (!orderId) return
    try {
      const now = new Date().toISOString()
      // obtener línea actual
      const qr = (await (db as any).query({ orderLines: { $: { where: { id: lineId }, limit: 1, fields: ["quantity", "total"] } } } as any)) as any
      const line = qr?.orderLines?.[0]
      const newQty = Number(line?.quantity || 0) + 1
      const inc = itemPrice
      await (db as any).transact([
        (db as any).tx.orderLines[lineId].update({ quantity: newQty, total: (line?.total || 0) + inc, updatedAt: now }),
        (db as any).tx.orders[orderId].update({ total: { $inc: inc }, updatedAt: now }),
      ])
    } catch {}
  }

  async function decrementLine(lineId: string, itemPrice: number) {
    if (!orderId) return
    try {
      const now = new Date().toISOString()
      const qr = (await (db as any).query({ orderLines: { $: { where: { id: lineId }, limit: 1, fields: ["quantity", "total"] } } } as any)) as any
      const line = qr?.orderLines?.[0]
      const currentQty = Number(line?.quantity || 0)
      if (currentQty <= 1) {
        // eliminar línea
        await (db as any).transact([
          (db as any).tx.orders[orderId].update({ total: { $inc: -itemPrice }, updatedAt: now }),
          (db as any).tx.orderLines[lineId].delete(),
        ])
        return
      }
      const dec = itemPrice
      await (db as any).transact([
        (db as any).tx.orderLines[lineId].update({ quantity: currentQty - 1, total: (line?.total || 0) - dec, updatedAt: now }),
        (db as any).tx.orders[orderId].update({ total: { $inc: -dec }, updatedAt: now }),
      ])
    } catch {}
  }

  async function removeLine(lineId: string, lineTotal: number) {
    if (!orderId) return
    try {
      const now = new Date().toISOString()
      await (db as any).transact([
        (db as any).tx.orders[orderId].update({ total: { $inc: -Number(lineTotal || 0) }, updatedAt: now }),
        (db as any).tx.orderLines[lineId].delete(),
      ])
    } catch {}
  }

  async function onSubmitScan(e: React.FormEvent) {
    e.preventDefault()
    const scanned = barcode.trim()
    if (!scanned) return
    // Limpiar input y foco primero para evitar dobles submits por scanner
    setBarcode("")
    scannerInputRef.current?.blur()
    scannerInputRef.current?.focus()
    setScannedValue(scanned)
    console.log('[POS] submit', scanned)
    const oid = await upsertOpenOrderClient()
    if (!oid) return
    const matches = getItemMatchesForScan(scanned)
    console.log('[POS] memory matches', matches.length)
    if (matches.length === 1) {
      const item = matches[0]
      const ok = await addItemToOrderClient(oid, item, 1)
      // UI refleja desde DB; guardia local por si grid hace doble-click
      if (ok) {
        console.log('[POS] added via memory', { orderId: oid, itemId: item.id })
        const now = Date.now(); const last = lastAddRef.current
        if (!(last && last.id === item.id && now - last.at < 400)) lastAddRef.current = { id: item.id, at: now }
      }
      return
    }
    const item = await resolveItemByScan(scanned)
    if (item) {
      const ok = await addItemToOrderClient(oid, item, 1)
      if (ok) {
        console.log('[POS] added via query', { orderId: oid, itemId: item.id })
        const now = Date.now(); const last = lastAddRef.current
        if (!(last && last.id === item.id && now - last.at < 400)) lastAddRef.current = { id: item.id, at: now }
      }
    }
  }

  function clearScanFilter() {
    setScannedValue(null)
    lastScanAddedRef.current = null
  }



  const orderTotal = orderTotalNumber

  // Sin suscripción a eventos para evitar duplicación y latencia en POS

  return (
    <main className="min-h-screen md:h-screen p-0">
      <div className="w-full md:h-full grid grid-cols-1 md:grid-cols-2">
        {/* Catálogo */}
        <div className="md:h-full flex flex-col px-6 py-6 gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Punto de venta</h1>
            {isLoadingList && (
              <div className="text-xs opacity-80 flex items-center gap-1">
                <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Cargando…</span>
              </div>
            )}
          </div>

          {/* Entrada scanner + búsqueda */}
          <form onSubmit={onSubmitScan} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm">Scanner</label>
                <input
                  ref={scannerInputRef}
                  type="text"
                  inputMode="text"
                  enterKeyHint="done"
                  autoCorrect="off"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full px-3 py-2 bg-transparent border border-transparent focus:outline-none focus:ring-0 font-mono tracking-wide text-base sm:text-lg"
                  placeholder="Escaneá o pegá un valor"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Buscar</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-transparent border border-white/20"
                  placeholder="Nombre o SKU"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button type="submit" className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black">Buscar</button>
              {scannedValue && (
                <div className="text-xs opacity-80 flex items-center gap-2">
                  <span className="font-mono truncate max-w-[140px]">{scannedValue}</span>
                  <span>Coincidencias: {matchedItemIds.size}</span>
                  <button type="button" className="px-2 py-0.5 border border-white/40" onClick={clearScanFilter}>Limpiar</button>
                </div>
              )}
            </div>
          </form>

          {/* Grilla de items */}
          <div className="flex-1 md:minh-0 md:overflow-hidden">
            {isLoadingList ? (
              <div className="text-sm opacity-70">Cargando items…</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm opacity-70">Sin items</div>
            ) : (
              <ItemsGrid items={filteredItems} onAdd={async (it) => {
                const oid = await upsertOpenOrderClient()
                if (!oid) return
                const ok = await addItemToOrderClient(oid, it, 1)
                if (ok) {
                  const now = Date.now(); const last = lastAddRef.current
                  if (!(last && last.id === it.id && now - last.at < 400)) lastAddRef.current = { id: it.id, at: now }
                }
              }} />
            )}
          </div>
        </div>

        {/* Orden */}
        <div className="md:h-full px-6 py-6 md:overflow-y-auto" style={{ borderLeft: '1px solid var(--border)' }}>
          <h2 className="text-xl font-semibold mb-3">Orden</h2>
          {orderLines.length === 0 ? (
            <div className="text-sm opacity-70">Sin items en la orden</div>
          ) : (
            <div className="space-y-3">
              {orderLines.map((l) => (
                <div key={`line-${l.item.id}`} className="flex items-center gap-3 border border-white/20 p-2">
                  <div className="h-12 w-12 bg-black/20" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{l.item.name || "(Sin título)"}</div>
                    <div className="text-xs opacity-70">SKU: {l.item.sku || "-"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="h-6 w-6 border border-white/40" onClick={() => decrementLine(l.id, (l.price || 0))}>-</button>
                    <span className="w-6 text-center text-sm">{l.quantity}</span>
                    <button type="button" className="h-6 w-6 border border-white/40" onClick={() => incrementLine(l.id, (l.price || 0))}>+</button>
                  </div>
                  <div className="w-20 text-right text-sm">
                    ${typeof l.item.price === 'number' ? (l.item.price * l.quantity).toFixed(2) : '0.00'}
                  </div>
                  <button type="button" className="h-6 w-6 border border-white/40" onClick={() => removeLine(l.id, (l.total || 0))}>×</button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/20 pt-2">
                <span className="text-sm">Total</span>
                <span className="text-lg font-semibold">${orderTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="px-3 py-2 border border-white/40">Cancelar</button>
                <button type="button" className="px-3 py-2 bg-black text-white dark:bg-white dark:text-black">Cobrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function ItemsGrid({ items, onAdd }: { items: ItemBase[]; onAdd: (it: ItemBase) => void }) {
  const getPreviewUrl = (it: any): string | null => {
    const attachments = Array.isArray((it as any)?.attachments) ? (it as any).attachments : []
    const primary = attachments.find((a: any) => !!a?.isPrimary && Array.isArray(a?.$files) && a.$files.length > 0)
    if (primary) return primary.$files[0]?.url ?? null
    for (const a of attachments) {
      if (Array.isArray((a as any)?.$files) && (a as any).$files.length > 0) return (a as any).$files[0]?.url ?? null
    }
    const files = Array.isArray((it as any)?.$files) ? (it as any).$files : []
    if (files.length > 0) return files[0]?.url ?? null
    return null
  }
  return (
    <div className="md:h-full md:overflow-y-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map((it) => {
          const url = getPreviewUrl(it as any)
          return (
            <button
              key={`pos-${it.id}`}
              type="button"
              onClick={() => onAdd(it)}
              className="text-left border border-white/20 hover:border-white/60"
            >
              <div className="relative h-32 w-full bg-black/20 overflow-hidden">
                {url ? (
                  <img src={url} alt={it.name || "item"} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[10px] opacity-60">Sin imagen</div>
                )}
              </div>
              <div className="p-2 space-y-1">
                <div className="text-xs truncate">{it.name || "(Sin título)"}</div>
                <div className="text-[11px] opacity-70 truncate">SKU: {it.sku || "-"}</div>
                <div className="text-sm">${typeof it.price === 'number' ? it.price.toFixed(2) : '0.00'}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


