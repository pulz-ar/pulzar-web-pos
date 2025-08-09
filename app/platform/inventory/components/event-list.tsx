"use client"

import React, { memo } from "react"
import ItemBrief from "./item-brief"

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
  identifierMap,
  itemMap,
}: {
  events: EventRecord[]
  onSelect: (e: EventRecord) => void
  identifierMap: Map<string, { id: string; value: string; type?: string; symbology?: string }>
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
          const idf = resolved?.identifierId ? identifierMap.get(resolved.identifierId) : undefined
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
                  {idf && (
                    <div className="text-xs flex items-center gap-2">
                      <span className="opacity-60 flex items-center gap-1">
                        {/* barcode icon */}
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 4v16M6 7v10M9 4v16M12 7v10M15 4v16M18 7v10M21 4v16" />
                        </svg>
                        Identifier
                      </span>
                      <span className="font-mono">{idf.value}</span>
                      {(idf.type || idf.symbology) && <span className="opacity-60">({idf.type}{idf.symbology ? ` / ${idf.symbology}` : ""})</span>}
                    </div>
                  )}
                </div>

                {/* Right: item + acción */}
                <div className="col-span-12 md:col-span-6 mt-1 flex items-start justify-between gap-2">
                {it ? <ItemBrief item={it} /> : <span className="opacity-60">Sin item asociado</span>}
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


