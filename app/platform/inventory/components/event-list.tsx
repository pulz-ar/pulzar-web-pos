"use client"

import React, { memo } from "react"

export type EventRecord = {
  id: string
  type: string
  content: any
  createdAt?: string
  serverCreatedAt?: string | number
}

function EventListComponent({
  events,
  onSelect,
  barcodeMap,
  itemMap,
}: {
  events: EventRecord[]
  onSelect: (e: EventRecord) => void
  barcodeMap: Map<string, { id: string; code: string; scheme?: string }>
  itemMap: Map<string, { id: string; name?: string; description?: string; status?: string }>
}) {
  return (
    <div className="md:h-full md:overflow-y-auto">
      <ul className="space-y-3">
        {events.map((e) => {
          const status = typeof e.content === "object" && e.content?.status ? String(e.content.status) : null
          const payload = typeof e.content === "object" && e.content?.payload ? e.content.payload : null
          const isScannerRead = e.type === "scanner.read"
          const readable = isScannerRead ? payload?.raw : null
          const resolved = (e as any)?.content?.analysis?.resolved
          const bc = resolved?.barcodeId ? barcodeMap.get(resolved.barcodeId) : undefined
          const it = resolved?.itemId ? itemMap.get(resolved.itemId) : undefined
          const showTime = status !== "pending"
          return (
            <li key={e.id} className="text-sm py-2 border border-white/10 rounded-sm px-3">
              <div className="md:grid md:grid-cols-12 md:gap-4">
                {/* Header */}
                <div className="col-span-12 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{e.type}</span>
                    {status && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
                        {status}
                      </span>
                    )}
                    <span className="font-mono opacity-40 text-[10px] truncate max-w-[140px]">#{e.id}</span>
                  </div>
                  <span className="opacity-60 text-xs whitespace-nowrap">
                    {showTime
                      ? e.createdAt
                        ? new Date(e.createdAt).toLocaleString()
                        : e.serverCreatedAt
                        ? new Date(Number(e.serverCreatedAt)).toLocaleString()
                        : ""
                      : ""}
                  </span>
                </div>

                {/* Left: lectura + barcode */}
                <div className="col-span-12 md:col-span-6 mt-1 space-y-1">
                  <div className="opacity-80 break-words text-xs flex items-center justify-between gap-2">
                    <div className="truncate">
                      {isScannerRead && readable ? (
                        <span className="font-mono">{String(readable)}</span>
                      ) : (
                        <span className="opacity-60">{/* otros tipos no se muestran detalles */}</span>
                      )}
                    </div>
                  </div>
                  {bc && (
                    <div className="text-xs flex items-center gap-2">
                      <span className="opacity-60 flex items-center gap-1">
                        {/* barcode icon */}
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 4v16M6 7v10M9 4v16M12 7v10M15 4v16M18 7v10M21 4v16" />
                        </svg>
                        Barcode
                      </span>
                      <span className="font-mono">{bc.code}</span>
                      {bc.scheme && <span className="opacity-60">({bc.scheme})</span>}
                    </div>
                  )}
                </div>

                {/* Right: item + acción */}
                <div className="col-span-12 md:col-span-6 mt-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs space-y-1">
                    {it ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="opacity-60 flex items-center gap-1">
                            {/* item icon */}
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <rect x="3" y="7" width="18" height="13" rx="2" />
                              <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z" />
                            </svg>
                            Item
                          </span>
                          <span className="truncate">{it.name || "(Sin título)"}</span>
                          {it.status && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-70">{it.status}</span>
                          )}
                        </div>
                        {it.description && <div className="opacity-60 line-clamp-2">{it.description}</div>}
                      </>
                    ) : (
                      <span className="opacity-60">Sin item asociado</span>
                    )}
                  </div>
                  {isScannerRead && (
                    <button
                      type="button"
                      className="text-xs inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 opacity-70 hover:opacity-100 whitespace-nowrap"
                      onClick={() => onSelect(e)}
                    >
                      Detalle <span aria-hidden>{"\u203A"}</span>
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const EventList = memo(EventListComponent)
export default EventList


