"use client"

import { init } from "@instantdb/react"
import { useMemo } from "react"

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
        },
      }
    : null

  const { isLoading: isLoadingItem, data: itemData } = db.useQuery(itemQuery)
  const item = itemData?.items?.[0]

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
          {resolved?.itemId && (
        <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Item</div>
                {!isLoadingItem && item?.status && (
                  <span className="inline-flex items-center gap-1 border border-white/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded-none">
                    {item.status}
                  </span>
                )}
              </div>
          {isLoadingItem ? (
            <div className="text-xs opacity-70">Cargando item...</div>
          ) : item ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">{item.name || "(Sin título)"}</div>
              {item.description && (
                <div className="text-xs opacity-80 line-clamp-3">{item.description}</div>
              )}
              <div className="text-xs opacity-80">Item ID: <span className="font-mono">{resolved.itemId}</span></div>
            </div>
          ) : (
            <div className="text-xs opacity-70">Item no encontrado</div>
          )}
        </section>
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
    },
  }
  const { isLoading, data } = db.useQuery(query as any)
  if (isLoading) return <div className="text-xs opacity-70">Cargando barcode...</div>
  const bc = (data?.barcodes?.[0] ?? null) as { id: string; code: string; scheme?: string } | null
  if (!bc) return null
  return (
    <div className="text-xs opacity-80 flex items-center gap-2">
      <span className="font-mono">{bc.code}</span>
      {bc.scheme && <span className="opacity-60">({bc.scheme})</span>}
    </div>
  )
}


