"use client"

import { init } from "@instantdb/react"
import { useMemo, useRef, useState, useTransition } from "react"
import { createItemForBarcode, unlinkItemFromBarcode, updateItemFields, uploadItemImages } from "./actions"

const db = init({ appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID! })

interface EventScannerReadProps {
  eventId: string
}

/**
 * EventScannerRead
 * Muestra el detalle interpretado de un evento scanner.read
 * - Detecta si el payload.raw parece un código de barras, URL u otro
 */
export default function EventScannerRead({ eventId }: EventScannerReadProps) {
  const query = eventId
    ? {
        events: {
          $: {
            where: { id: eventId },
            limit: 1,
          },
        },
      }
    : null

  const { isLoading, data } = db.useQuery(query as any)

  if (!eventId) return null
  if (isLoading) return <div className="text-sm opacity-70">Cargando detalle...</div>

  const ev = (data?.events?.[0] ?? null) as
    | { id: string; type: string; content: any; createdAt?: string; serverCreatedAt?: string | number }
    | null

  if (!ev) return <div className="text-sm opacity-70">Evento no encontrado</div>

  const raw: unknown = ev?.content?.payload?.raw
  const resolved: { barcodeId?: string; itemId?: string } | undefined = ev?.content?.analysis?.resolved
  const itemId = resolved?.itemId

  const itemQuery = itemId
    ? {
        items: {
          $: {
            where: { id: itemId },
            limit: 1,
          },
          $files: {},
        },
      }
    : null

  const { isLoading: isLoadingItem, data: itemData } = db.useQuery(itemQuery)
  const item = itemData?.items?.[0]
  const files: Array<{ id: string; path: string; url: string }> = item?.$files ?? []

  const interpretation = useMemo(() => {
    const str = typeof raw === "string" ? raw.trim() : ""
    // Heurísticas simples: URL / barcode (numérico) / desconocido
    const isUrl = /^(https?:\/\/)/i.test(str)
    const isNumeric = /^\d{8,}$/.test(str)
    if (isUrl) return { kind: "url" as const, value: str }
    if (isNumeric) return { kind: "barcode" as const, value: str }
    return { kind: "unknown" as const, value: str }
  }, [raw])

  const status: string | undefined = (ev as any)?.content?.status

  return (
    <div className="relative">
      {/* Static border */}
      <div className="border border-white/30 rounded-sm p-4">
        <div className="space-y-6">
      {/* Event / Scanner Read: datos básicos */}
          <section className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Evento</div>
              {status && (
                <span className="inline-flex items-center gap-1 border border-white/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none">
                  {status}
                </span>
              )}
            </div>
            <div className="text-xs opacity-80 flex items-center gap-2">
              <span className="font-mono">{ev.id}</span>
              <span className="opacity-60">{ev.type}</span>
              <span className="opacity-60">{new Date(ev.createdAt ? ev.createdAt : Number(ev.serverCreatedAt ?? Date.now())).toLocaleString()}</span>
            </div>
      </section>

      {/* Barcode: código y esquema */}
      {resolved?.barcodeId && (
        <section className="space-y-2">
          <div className="text-sm opacity-70">Barcode</div>
          <StandardBarcodeInfo barcodeId={resolved.barcodeId} />
        </section>
      )}

      {/* Item asociado (puede estar vacío inicialmente) */}
          {resolved?.itemId ? (
        <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm opacity-70">Item</div>
                <div className="flex items-center gap-2">
                  {!isLoadingItem && item?.status && (
                    <span className="inline-flex items-center gap-1 border border-white/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none">
                      {item.status}
                    </span>
                  )}
                  {resolved?.barcodeId && (
                    <button
                      type="button"
                      title="Desvincular item"
                      className="inline-flex items-center justify-center h-6 w-6 border border-white/40 hover:border-white/70 text-sm"
                      onClick={async () => {
                        await unlinkItemFromBarcode({ barcodeId: resolved.barcodeId! })
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
          {isLoadingItem ? (
            <div className="text-xs opacity-70">Cargando item...</div>
          ) : item ? (
            <ItemEditor item={item} files={files} barcodeId={resolved.barcodeId} />
          ) : (
            <div className="text-xs opacity-70">Item no encontrado</div>
          )}
        </section>
      ) : (
        // Si hay barcode pero no item vinculado aún, permitir crear
        resolved?.barcodeId ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Item</div>
            </div>
            <CreateItemForBarcodeButton barcodeId={resolved.barcodeId} />
          </section>
        ) : null
      )}
        </div>
      </div>
      {status === "processing" && (
        <div className="pointer-events-none absolute inset-0 rounded-sm border border-white/70 animate-pulse" />
      )}
    </div>
  )
}

function StandardBarcodeInfo({ barcodeId }: { barcodeId: string }) {
  const query = {
    barcodes: {
      $: { where: { id: barcodeId }, limit: 1 },
      item: { $: { fields: ["id"] } },
    },
  }
  const { isLoading, data } = db.useQuery(query as any)
  if (isLoading) return <div className="text-xs opacity-70">Cargando barcode...</div>
  const bc = (data?.barcodes?.[0] ?? null) as { id: string; code: string; scheme?: string; item?: { id: string } } | null
  if (!bc) return null
  return (
    <div className="text-xs opacity-80 flex items-center gap-2">
      <span className="font-mono">{bc.code}</span>
      {bc.scheme && <span className="opacity-60">({bc.scheme})</span>}
      {bc.item?.id && (
        <button
          type="button"
          title="Desvincular item"
          className="ml-2 inline-flex items-center justify-center h-5 w-5 border border-white/40 hover:border-white/70 text-xs"
          onClick={async () => {
            await unlinkItemFromBarcode({ barcodeId })
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function CreateItemForBarcodeButton({ barcodeId }: { barcodeId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      className="text-xs inline-flex items-center gap-1 rounded-none px-2 py-1 border border-white/40 hover:border-white/70"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await createItemForBarcode({ barcodeId })
        })
      }}
    >
      {isPending ? "Creando..." : "Crear item y vincular"}
    </button>
  )
}

function ItemEditor({ item, files, barcodeId }: { item: any; files: Array<{ id: string; path: string; url: string }>; barcodeId?: string }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    sku: item?.sku ?? "",
    price: typeof item?.price === "number" ? item.price : 0,
    stock: typeof item?.stock === "number" ? item.stock : 0,
    status: item?.status ?? "pending",
  })
  const [isSaving, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onChange = (key: keyof typeof form) => (e: any) => {
    const value = key === "price" || key === "stock" ? Number(e.target.value) : e.target.value
    setForm((s) => ({ ...s, [key]: value }))
  }

  const onSave = () => {
    startTransition(async () => {
      await updateItemFields({ itemId: item.id, updates: form })
    })
  }

  // Carga de imágenes (web + mobile capture)
  const onSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesSel = Array.from(e.target.files || [])
    if (filesSel.length === 0) return
    // Subimos vía action backend: convertimos File -> ArrayBuffer -> Buffer
    const entries = await Promise.all(
      filesSel.map(async (f) => {
        const ab = await f.arrayBuffer()
        // Convertir a base64 para pasar por Server Actions
        const base64 = btoa(String.fromCharCode(...new Uint8Array(ab)))
        const safeName = `${item.id}/${Date.now()}-${encodeURIComponent(f.name)}`
        return { path: safeName, base64, contentType: f.type }
      })
    )
    await uploadItemImages({ itemId: item.id, files: entries })
    // limpiar input para poder volver a subir mismo nombre
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs opacity-60">Nombre</label>
          <input className="w-full px-2 py-1 bg-transparent border border-white/20"
                 value={form.name} onChange={onChange("name")} placeholder="Nombre" />
        </div>
        <div>
          <label className="text-xs opacity-60">SKU</label>
          <input className="w-full px-2 py-1 bg-transparent border border-white/20"
                 value={form.sku} onChange={onChange("sku")} placeholder="SKU" />
        </div>
        <div>
          <label className="text-xs opacity-60">Precio</label>
          <input type="number" className="w-full px-2 py-1 bg-transparent border border-white/20"
                 value={form.price} onChange={onChange("price")} />
        </div>
        <div>
          <label className="text-xs opacity-60">Stock</label>
          <input type="number" className="w-full px-2 py-1 bg-transparent border border-white/20"
                 value={form.stock} onChange={onChange("stock")} />
        </div>
      </div>
      <div>
        <label className="text-xs opacity-60">Descripción</label>
        <textarea className="w-full px-2 py-1 bg-transparent border border-white/20"
                  rows={3}
                  value={form.description} onChange={onChange("description")} placeholder="Descripción" />
      </div>
      <div className="flex gap-2">
        <button type="button" className="px-2 py-1 border border-white/40 text-xs"
                disabled={isSaving} onClick={onSave}>{isSaving ? "Guardando..." : "Guardar"}</button>
      </div>

      {/* Carrusel de imágenes fijo */}
      <div className="space-y-2">
        <div className="text-sm opacity-70">Imágenes</div>
        <div className="relative w-full h-48 sm:h-56 md:h-64">
          <ImageCarousel files={files} />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onSelectFiles}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  )
}

function ImageCarousel({ files }: { files: Array<{ id: string; path: string; url: string }> }) {
  const [index, setIndex] = useState(0)
  const has = files.length > 0
  const current = has ? files[Math.max(0, Math.min(index, files.length - 1))] : null
  return (
    <div className="h-full w-full border border-white/20 flex items-center justify-center relative overflow-hidden">
      {current ? (
        // Contenedor fijo, imagen contain
        <img src={current.url} alt="item" className="object-contain w-full h-full" />
      ) : (
        <div className="text-xs opacity-60">Sin imágenes</div>
      )}
      {files.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 border border-white/40 text-xs"
            onClick={() => setIndex((i) => (i - 1 + files.length) % files.length)}
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 border border-white/40 text-xs"
            onClick={() => setIndex((i) => (i + 1) % files.length)}
          >
            ›
          </button>
        </>
      )}
    </div>
  )
}


