"use client"

import { useMemo, useState, useTransition } from "react"
import { init } from "@instantdb/react"
import { submitBarcode } from "./actions"
import EventScannerRead from "./event-scanner-read"

const db = init({ appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID! })

export default function InventoryCapturePage() {
  const [barcode, setBarcode] = useState<string>("77988690")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  // Base query: solo eventos
  const baseQuery = {
    events: {
      $: {
        limit: 25,
        order: {
          serverCreatedAt: "desc" as const,
        },
        fields: ["type", "createdAt", "content"],
      },
    },
  }
  const { data: baseData } = db.useQuery(baseQuery)
  const events = (baseData?.events ?? []) as Array<{
    id: string
    type: string
    content: any
    createdAt?: string
    serverCreatedAt?: string | number
  }>
  const firstEventId = events[0]?.id

  const { barcodeIds, itemIds } = useMemo(() => {
    const b: string[] = []
    const it: string[] = []
    for (const e of events) {
      const resolved = (e as any)?.content?.analysis?.resolved
      if (resolved?.barcodeId) b.push(resolved.barcodeId)
      if (resolved?.itemId) it.push(resolved.itemId)
    }
    return { barcodeIds: Array.from(new Set(b)), itemIds: Array.from(new Set(it)) }
  }, [events])

  // Query compuesta: eventos + (barcodes/items) según ids detectados
  const composedQuery: any = useMemo(() => {
    const q: any = baseQuery
    if (barcodeIds.length) {
      q.barcodes = { $: { where: { id: { $in: barcodeIds } }, fields: ["code", "scheme"] } }
    }
    if (itemIds.length) {
      q.items = { $: { where: { id: { $in: itemIds } }, fields: ["name", "description", "status"] } }
    }
    return q
  }, [barcodeIds, itemIds])

  const { isLoading: isLoadingComposed, data: composedData } = db.useQuery(composedQuery)

  const barcodeMap = useMemo(() => {
    const m = new Map<string, { id: string; code: string; scheme?: string }>()
    const list = (composedData as any)?.barcodes ?? []
    for (const bc of list) m.set(bc.id, bc)
    return m
  }, [composedData])
  const itemMap = useMemo(() => {
    const m = new Map<string, { id: string; name?: string; description?: string; status?: string }>()
    const list = (composedData as any)?.items ?? []
    for (const it of list) m.set(it.id, it)
    return m
  }, [composedData])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrorMessage(null)
    startTransition(async () => {
      const result = await submitBarcode(barcode)
      if (!result.ok) {
        setErrorMessage(result.error)
      } else {
        setBarcode("")
      }
    })
  }

  return (
    <main className="h-screen p-0">
      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2">
        <div className="h-full flex flex-col px-6 py-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Inventory</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm">Entrada de scanner</label>
              <input
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
            <button
              type="submit"
              className="w-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={isPending}
            >
              {isPending && (
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
              )}
              {isPending ? "Guardando..." : "Guardar"}
            </button>
          </form>
          {errorMessage && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Eventos</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoadingComposed ? (
              <div className="text-sm opacity-70">Cargando eventos...</div>
            ) : events.length === 0 ? (
              <div className="text-sm opacity-70">Sin registros</div>
            ) : (
              <EventList
                key={firstEventId ?? "no-first"}
                events={events}
                onSelect={(e) => setSelectedEventId(e.id)}
                barcodeMap={barcodeMap}
                itemMap={itemMap}
              />
            )}
          </div>
        </div>

        <div className="h-full px-6 py-6 overflow-y-auto">
          <EventDetails eventId={selectedEventId} />
        </div>
      </div>
    </main>
  )
}

type EventRecord = {
  id: string
  type: string
  content: any
  createdAt?: string
  serverCreatedAt?: string | number
}

function EventList({
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
    <div className="h-full overflow-y-auto">
      <ul className="space-y-3">
        {events.map((e) => {
        const status = typeof e.content === "object" && e.content?.status ? String(e.content.status) : null
        const payload = typeof e.content === "object" && e.content?.payload ? e.content.payload : null
        const isScannerRead = e.type === "scanner.read"
        const readable = isScannerRead ? payload?.raw : null
          const resolved = (e as any)?.content?.analysis?.resolved
          const bc = resolved?.barcodeId ? barcodeMap.get(resolved.barcodeId) : undefined
          const it = resolved?.itemId ? itemMap.get(resolved.itemId) : undefined
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
                </div>
                <span className="opacity-60 text-xs whitespace-nowrap">
                  {e.createdAt
                    ? new Date(e.createdAt).toLocaleString()
                    : e.serverCreatedAt
                    ? new Date(Number(e.serverCreatedAt)).toLocaleString()
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
                      {it.description && (
                        <div className="opacity-60 line-clamp-2">{it.description}</div>
                      )}
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

function EventDetails({ eventId }: { eventId: string | null }) {
  const detailQuery = eventId
    ? {
        events: {
          $: {
            where: { id: eventId },
            limit: 1,
          },
        },
      }
    : null
  const { isLoading, data } = db.useQuery(detailQuery as any)
  if (!eventId) {
    return <div className="text-sm opacity-70">Selecciona un evento para ver detalles</div>
  }
  if (isLoading) {
    return <div className="text-sm opacity-70">Cargando detalle...</div>
  }
  const ev = (data?.events?.[0] ?? null) as EventRecord | null
  if (!ev) {
    return <div className="text-sm opacity-70">Evento no encontrado</div>
  }
  if (ev.type === "scanner.read") {
    return <EventScannerRead eventId={ev.id} />
  }
  return <div className="text-sm opacity-70">Sin detalles para este tipo de evento</div>
}


