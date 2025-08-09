"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { init } from "@instantdb/react"
import ItemBrief from "@/app/platform/inventory/components/item-brief"
import ItemImagesManager from "@/app/platform/inventory/components/item-images"

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

export default function ItemsPage() {
  const listQuery: any = {
    items: {
      $: {
        limit: 50,
        order: { serverCreatedAt: "desc" as const },
        fields: ["name", "description", "sku", "price", "stock", "status", "createdAt"],
      },
      // incluir archivos para previews
      attachments: { $: { fields: ["id", "isPrimary"] }, $files: {} },
      $files: {},
    },
  }

  const { isLoading: isLoadingList, data: listData } = db.useQuery(listQuery)
  const items = (listData?.items ?? []) as ItemBase[]

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [barcode, setBarcode] = useState<string>("")
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const [scannedValue, setScannedValue] = useState<string | null>(null)
  const firstId = items[0]?.id ?? null

  useEffect(() => {
    if (!selectedItemId && firstId) setSelectedItemId(firstId)
  }, [firstId, selectedItemId])

  // Query dinámica: buscar identifiers por valor escaneado para mapear a items
  const identifiersQuery = scannedValue
    ? ({
        identifiers: {
          $: { where: { value: scannedValue }, fields: ["value"] },
          item: { $: { fields: ["id"] } },
        },
      } as const)
    : null
  const { data: identifiersData, isLoading: isLoadingIdentifiers } = db.useQuery(identifiersQuery as any)

  const barcodesQuery = scannedValue
    ? ({
        barcodes: {
          $: { where: { code: scannedValue }, fields: ["code"] },
          item: { $: { fields: ["id"] } },
        },
      } as const)
    : null
  const { data: barcodesData, isLoading: isLoadingBarcodes } = db.useQuery(barcodesQuery as any)

  const itemsSkuQuery = scannedValue
    ? ({
        items: {
          $: { where: { sku: scannedValue }, fields: ["id"] },
        },
      } as const)
    : null
  const { data: itemsSkuData, isLoading: isLoadingItemsSku } = db.useQuery(itemsSkuQuery as any)

  const matchedItemIds: Set<string> = useMemo(() => {
    const out = new Set<string>()
    const list = (identifiersData as any)?.identifiers
    if (Array.isArray(list)) {
      for (const idf of list) {
        const id = idf?.item?.id
        if (id) out.add(id)
      }
    }
    const blist = (barcodesData as any)?.barcodes
    if (Array.isArray(blist)) {
      for (const bc of blist) {
        const id = bc?.item?.id
        if (id) out.add(id)
      }
    }
    const ilist = (itemsSkuData as any)?.items
    if (Array.isArray(ilist)) {
      for (const it of ilist) {
        const id = it?.id
        if (id) out.add(id)
      }
    }
    return out
  }, [identifiersData, barcodesData, itemsSkuData])

  const filteredItems: ItemBase[] = useMemo(() => {
    if (!scannedValue) return items
    if (matchedItemIds.size === 0) return []
    const setIds = matchedItemIds
    return items.filter((it) => setIds.has(it.id))
  }, [items, scannedValue, matchedItemIds])

  useEffect(() => {
    if (filteredItems.length > 0) {
      setSelectedItemId(filteredItems[0]?.id ?? null)
    } else if (!scannedValue && items.length > 0) {
      setSelectedItemId(items[0]?.id ?? null)
    }
  }, [filteredItems.length, items.length, scannedValue])

  // Captura global de teclado similar a inventory: enruta al input si no se está editando otro control
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
        if (!barcode || barcode.trim() === "") {
          e.preventDefault()
          return
        }
        const form = scannerInputRef.current?.form as HTMLFormElement | undefined
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit()
        } else if (form) {
          form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
        }
        e.preventDefault()
        return
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [barcode])

  function onSubmitScan(e: React.FormEvent) {
    e.preventDefault()
    const valueToSubmit = barcode.trim()
    if (!valueToSubmit) return
    setBarcode("")
    scannerInputRef.current?.focus()
    setScannedValue(valueToSubmit)
  }

  function clearFilter() {
    setScannedValue(null)
  }

  return (
    <main className="min-h-screen md:h-screen p-0">
      <div className="w-full md:h-full grid grid-cols-1 md:grid-cols-2">
        {/* Lista */}
        <div className="md:h-full flex flex-col px-6 py-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Items</h1>
            {/* Entrada de scanner */}
            <form onSubmit={onSubmitScan} className="mt-3 space-y-2">
              <div className="space-y-1">
                <label className="text-sm">Entrada de scanner</label>
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
                  placeholder="Escaneá o pegá un valor (URL, código, etc.)"
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black"
                >
                  Buscar
                </button>
                {scannedValue && (
                  <div className="text-xs opacity-80 flex items-center gap-2">
                    <span className="font-mono truncate max-w-[160px]">{scannedValue}</span>
                    {isLoadingIdentifiers || isLoadingBarcodes || isLoadingItemsSku ? (
                      <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>Coincidencias: {matchedItemIds.size}</span>
                    )}
                    <button type="button" className="px-2 py-0.5 border border-white/40" onClick={clearFilter}>
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
            </form>
            <div className="mt-2 flex items-center justify-between">
              <p className="opacity-70 text-sm">Listado navegable, solo lectura.</p>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  className={[
                    "px-2 py-1 border rounded-none",
                    viewMode === "list" ? "border-white/80" : "border-white/30 opacity-70",
                  ].join(" ")}
                  onClick={() => setViewMode("list")}
                  title="Ver como lista"
                >
                  Lista
                </button>
                <button
                  type="button"
                  className={[
                    "px-2 py-1 border rounded-none",
                    viewMode === "grid" ? "border-white/80" : "border-white/30 opacity-70",
                  ].join(" ")}
                  onClick={() => setViewMode("grid")}
                  title="Ver como grilla"
                >
                  Grilla
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 md:minh-0 md:overflow-hidden">
            {isLoadingList ? (
              <div className="text-sm opacity-70">Cargando items…</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm opacity-70">Sin items</div>
            ) : (
              viewMode === "list" ? (
                <ItemsList items={filteredItems} onSelect={(id) => setSelectedItemId(id)} selectedItemId={selectedItemId} />
              ) : (
                <ItemsGrid items={filteredItems} onSelect={(id) => setSelectedItemId(id)} selectedItemId={selectedItemId} />
              )
            )}
          </div>
        </div>

        {/* Detalle */}
        <div className="hidden md:block md:h-full px-6 py-6 md:overflow-y-auto">
          <ItemDetails itemId={selectedItemId} />
        </div>
      </div>
      {/* En mobile, mostrar detalle debajo de la lista */}
      <div className="md:hidden px-6 pb-6">
        <ItemDetails itemId={selectedItemId} />
      </div>
    </main>
  )
}

function ItemsList({
  items,
  onSelect,
  selectedItemId,
}: {
  items: ItemBase[]
  onSelect: (id: string) => void
  selectedItemId: string | null
}) {
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
      <ul className="space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className={[
              "text-sm py-2 rounded-sm px-3 border cursor-pointer",
              it.id === selectedItemId ? "bg-black/5 dark:bg-white/10" : "",
            ].join(" ")}
            style={{ borderColor: "var(--border-weak)" }}
            onClick={() => onSelect(it.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-12 w-12 border border-white/20 bg-black/20 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const url = getPreviewUrl(it as any)
                    return url ? (
                      <img src={url} alt="thumb" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] opacity-60">Sin imagen</span>
                    )
                  })()}
                </div>
                <ItemBrief item={{ id: it.id, name: it.name, description: it.description, status: it.status }} />
              </div>
              <span className="opacity-60 text-xs whitespace-nowrap">
                {it.createdAt
                  ? new Date(it.createdAt).toLocaleString()
                  : it.serverCreatedAt
                  ? new Date(Number(it.serverCreatedAt)).toLocaleString()
                  : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ItemsGrid({
  items,
  onSelect,
  selectedItemId,
}: {
  items: ItemBase[]
  onSelect: (id: string) => void
  selectedItemId: string | null
}) {
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
              key={`grid-${it.id}`}
              type="button"
              onClick={() => onSelect(it.id)}
              className={[
                "text-left border",
                it.id === selectedItemId ? "border-white" : "border-white/20 hover:border-white/50",
              ].join(" ")}
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
                {it.status && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{ border: "1px solid var(--border-weak)" }}
                  >
                    {it.status}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ItemDetails({ itemId }: { itemId: string | null }) {
  const detailQuery = itemId
    ? ({
        items: {
          $: { where: { id: itemId }, limit: 1 },
          $files: {},
          attachments: { $: { fields: ["id", "isPrimary"] }, $files: {} },
        },
      } as const)
    : null

  const { isLoading, data } = db.useQuery(detailQuery as any)

  if (!itemId) return <div className="text-sm opacity-70">Seleccioná un item</div>
  if (isLoading) return <div className="text-sm opacity-70">Cargando detalle…</div>

  const item = (data?.items?.[0] ?? null) as any
  if (!item) return <div className="text-sm opacity-70">Item no encontrado</div>

  const attachments = item?.attachments ?? []
  const attachmentFiles = Array.isArray(attachments)
    ? attachments.flatMap((a: any) => (Array.isArray(a?.$files) ? a.$files : []))
    : []
  const files = attachmentFiles.length > 0 ? attachmentFiles : (item?.$files ?? [])

  return (
    <div className="relative">
      <div className="rounded-sm p-4 border" style={{ borderColor: "var(--border)" }}>
        <div className="space-y-4">
          <section className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Item</div>
              {item?.status && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none"
                  style={{ border: "1px solid var(--border-weak)" }}
                >
                  {item.status}
                </span>
              )}
            </div>
            <div className="text-xs opacity-80 flex items-center gap-2">
              <span className="font-mono">#{item.id}</span>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Nombre" value={item?.name || "(Sin título)"} />
            <Field label="SKU" value={item?.sku || "-"} />
            <Field label="Precio" value={typeof item?.price === "number" ? `$${item.price}` : "-"} />
            <Field label="Stock" value={typeof item?.stock === "number" ? String(item.stock) : "-"} />
          </section>

          {item?.description && (
            <section>
              <div className="text-xs opacity-60 mb-1">Descripción</div>
              <div className="text-sm opacity-80 whitespace-pre-wrap">{item.description}</div>
            </section>
          )}

          <section className="space-y-2">
            <div className="text-sm opacity-70">Imágenes</div>
            <ItemImagesManager files={files || []} previewHeightClass="h-48 sm:h-56 md:h-64" />
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className="w-full px-2 py-1 bg-transparent border border-white/20 text-sm">
        {value}
      </div>
    </div>
  )
}


