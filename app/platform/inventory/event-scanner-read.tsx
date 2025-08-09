"use client"

import { init } from "@instantdb/react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { createItemForIdentifier, unlinkItemFromIdentifier, updateItemFields, uploadItemAttachments } from "./actions"
import ItemImagesManager from "@/app/platform/inventory/components/item-images"

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
  const resolved: { identifierId?: string; itemId?: string } | undefined = ev?.content?.analysis?.resolved
  const itemId = resolved?.itemId

  const itemQuery = itemId
    ? {
        items: {
          $: {
            where: { id: itemId },
            limit: 1,
          },
          $files: {},
          attachments: { $: { fields: ["id", "isPrimary"] }, $files: {} },
        },
      }
    : null

  const { isLoading: isLoadingItem, data: itemData } = db.useQuery(itemQuery)
  const item = itemData?.items?.[0]
  const attachments = item?.attachments ?? []
  const attachmentFiles = Array.isArray(attachments)
    ? attachments.flatMap((a: any) => Array.isArray(a?.$files) ? a.$files : [])
    : []
  const files = attachmentFiles.length > 0 ? attachmentFiles : (item?.$files ?? [])

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
      <div className="rounded-sm p-4 border" style={{ borderColor: 'var(--border)' }}>
        <div className="space-y-6">
      {/* Event / Scanner Read: datos básicos */}
          <section className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Evento</div>
              {status && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none" style={{ border: '1px solid var(--border-weak)' }}>
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

      {/* Identifier: valor y tipo */}
      {resolved?.identifierId && (
        <section className="space-y-2">
          <div className="text-sm opacity-70">Identifier</div>
          <StandardIdentifierInfo identifierId={resolved.identifierId} />
        </section>
      )}

      {/* Item asociado (puede estar vacío inicialmente) */}
          {resolved?.itemId ? (
        <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm opacity-70">Item</div>
                <div className="flex items-center gap-2">
                  {!isLoadingItem && item?.status && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none" style={{ border: '1px solid var(--border-weak)' }}>
                      {item.status}
                    </span>
                  )}
                  {resolved?.identifierId && <ConfirmUnlinkButton identifierId={resolved.identifierId} />}
                </div>
              </div>
          {isLoadingItem ? (
            <div className="text-xs opacity-70">Cargando item...</div>
          ) : item ? (
            <ItemEditor key={(item as any)?.updatedAt ?? item.id} item={item} files={files} attachments={attachments} />
          ) : (
            <div className="text-xs opacity-70">Item no encontrado</div>
          )}
        </section>
      ) : (
        // Si hay identifier pero no item vinculado aún, permitir crear
        resolved?.identifierId ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Item</div>
            </div>
            <CreateItemForIdentifierButton identifierId={resolved.identifierId} />
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

function StandardIdentifierInfo({ identifierId }: { identifierId: string }) {
  const query = {
    identifiers: {
      $: { where: { id: identifierId }, limit: 1, fields: ["value", "type", "symbology"] },
      item: { $: { fields: ["id"] } },
    },
  } as any
  const { isLoading, data } = db.useQuery(query)
  if (isLoading) return <div className="text-xs opacity-70">Cargando identifier...</div>
  const idf = (data?.identifiers?.[0] ?? null) as { id: string; value: string; type?: string; symbology?: string; item?: { id: string } } | null
  if (!idf) return null
  return (
    <div className="text-xs opacity-80 flex items-center gap-2">
      <span className="font-mono">{idf.value}</span>
      {idf.type && <span className="opacity-60">({idf.type}{idf.symbology ? ` / ${idf.symbology}` : ""})</span>}
    </div>
  )
}

function CreateItemForIdentifierButton({ identifierId }: { identifierId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      className="text-xs inline-flex items-center gap-1 rounded-none px-2 py-1 border border-white/40 hover:border-white/70"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await createItemForIdentifier({ identifierId })
        })
      }}
    >
      {isPending ? "Creando..." : "Crear item y vincular"}
    </button>
  )
}

function ItemEditor({ item, files, attachments }: { item: any; files: any; attachments: any }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    sku: item?.sku ?? "",
    price: typeof item?.price === "number" ? item.price : 0,
    stock: typeof item?.stock === "number" ? item.stock : 0,
    status: item?.status ?? "pending",
  })
  // Sincronizar cuando llega/ cambia el item (evita quedarse con valores vacíos si el item carga después)
  useEffect(() => {
    setForm({
      name: item?.name ?? "",
      description: item?.description ?? "",
      sku: item?.sku ?? "",
      price: typeof item?.price === "number" ? item.price : 0,
      stock: typeof item?.stock === "number" ? item.stock : 0,
      status: item?.status ?? "pending",
    })
  }, [item?.id, item?.updatedAt])
  const [isSaving, startTransition] = useTransition()
  const [pendingFiles, setPendingFiles] = useState<Array<{ filename: string; base64: string; contentType?: string; previewURL: string; status: 'pending'|'uploading'|'done' }>>([])

  const onChange = (key: keyof typeof form) => (e: any) => {
    const value = key === "price" || key === "stock" ? Number(e.target.value) : e.target.value
    setForm((s) => ({ ...s, [key]: value }))
  }

  const onSave = () => {
    startTransition(async () => {
      await updateItemFields({ itemId: item.id, updates: form })
      if (pendingFiles.length > 0) {
        await uploadItemAttachments({ itemId: item.id, files: pendingFiles, kind: "image" })
        setPendingFiles([])
      }
    })
  }

  // ItemEditor delega la selección al gestor de imágenes (pending en el componente)

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
      {/* Gestor elegante de imágenes */}
      <div className="space-y-2">
        <div className="text-sm opacity-70">Imágenes</div>
        <div className="relative w-full">
            <ItemImagesManager
              files={files}
              itemId={item.id}
              attachments={attachments}
              deferUpload={true}
              pendingEntries={pendingFiles}
              onPendingChange={(next) => {
                // Evitar setState durante render en el mismo tick
                queueMicrotask(() => setPendingFiles(next as any))
              }}
              previewHeightClass="h-48 sm:h-56 md:h-64"
            />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="px-2 py-1 border border-white/40 text-xs"
                disabled={isSaving} onClick={onSave}>{isSaving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  )
}

function ImageCarousel({ files }: { files: Array<{ id: string; path: string; url: string }> }) {
  return (
    <ItemImagesManager files={files} />
  )
}

function ConfirmUnlinkButton({ identifierId }: { identifierId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  return (
    <>
      <button
        type="button"
        title="Desvincular item"
        className="inline-flex items-center justify-center h-6 w-6 border border-white/40 hover:border-white/70 text-sm"
        onClick={() => setOpen(true)}
      >
        ×
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !isPending && setOpen(false)} />
          <div className="relative z-10 w-[92%] max-w-sm bg-neutral-900 text-white border border-white/20 p-4">
            <div className="text-sm font-medium mb-2">Desvincular item</div>
            <div className="text-xs opacity-80 mb-4">¿Seguro que querés eliminar la relación entre este item y el código de barras?</div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-2 py-1 border border-white/30 text-xs"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-2 py-1 border border-white/60 text-xs flex items-center gap-2"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
            await unlinkItemFromIdentifier({ identifierId })
                    setOpen(false)
                  })
                }}
              >
                {isPending && <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


