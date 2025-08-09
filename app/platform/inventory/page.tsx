"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { init } from "@instantdb/react"
import { submitBarcode } from "./actions"
import EventDetails from "./components/event-details"
import EventList from "./components/event-list"

const db = init({ appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID! })

export default function InventoryCapturePage() {
  const [barcode, setBarcode] = useState<string>("77988690")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [autoFocusNew, setAutoFocusNew] = useState(false)
  const scannerInputRef = useRef<HTMLInputElement>(null)
  const [pendingQueue, setPendingQueue] = useState<Array<{ id: string; value: string }>>([])
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
  const { data: baseData, isLoading: isLoadingBase } = db.useQuery(baseQuery)
  const [cachedEvents, setCachedEvents] = useState<any[]>([])
  const events = ((baseData?.events ?? null) || cachedEvents) as Array<{
    id: string
    type: string
    content: any
    createdAt?: string
    serverCreatedAt?: string | number
  }>
  useEffect(() => {
    if (Array.isArray((baseData as any)?.events)) {
      setCachedEvents((baseData as any).events)
    }
  }, [baseData])
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

  // Combinar pendientes locales como eventos "virtuales" al inicio de la lista
  const displayEvents = useMemo(() => {
    const realIds = new Set(events.map((e) => e.id))
    const realByRaw = new Set(
      events.map((e) => (typeof e.content === 'object' ? e.content?.payload?.raw : null)).filter(Boolean)
    )
    const pendingAsEvents = pendingQueue
      .filter((p) => !realIds.has(p.id) && !realByRaw.has(p.value))
      .map((p) => ({
        id: p.id,
        type: "scanner.read",
        content: { status: "pending", payload: { raw: p.value } },
      }))
    return [...pendingAsEvents, ...events]
  }, [pendingQueue, events])

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
  const [barcodeMap, setBarcodeMap] = useState(
    () => new Map<string, { id: string; code: string; scheme?: string }>()
  )
  const [itemMap, setItemMap] = useState(
    () => new Map<string, { id: string; name?: string; description?: string; status?: string }>()
  )
  useEffect(() => {
    const listB = (composedData as any)?.barcodes
    if (Array.isArray(listB)) {
      const m = new Map<string, { id: string; code: string; scheme?: string }>()
      for (const bc of listB) m.set(bc.id, bc)
      setBarcodeMap(m)
    }
    const listI = (composedData as any)?.items
    if (Array.isArray(listI)) {
      const m = new Map<string, { id: string; name?: string; description?: string; status?: string }>()
      for (const it of listI) m.set(it.id, it)
      setItemMap(m)
    }
  }, [composedData])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrorMessage(null)
    // Limpiar inmediatamente para carga rápida, conservar valor a enviar
    const valueToSubmit = barcode
    setBarcode("")
    // Mantener foco en el input para seguir escaneando
    scannerInputRef.current?.focus()
    // Generar eventId en cliente (UUID si está, si no fallback) y agregar a cola local
    const clientEventId = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    setPendingQueue((q) => [{ id: clientEventId, value: valueToSubmit }, ...q])
    startTransition(async () => {
      const result = await submitBarcode(valueToSubmit, clientEventId)
      // Remover de cola local: por id real devuelto o por clientEventId
      setPendingQueue((q) => q.filter((p) => p.id !== (result.ok ? result.eventId : clientEventId)))
      if (!result.ok) {
        setErrorMessage(result.error)
      } else {
        // Usar el eventId devuelto para enfocar inmediatamente
        if (result.eventId) {
          setSelectedEventId(result.eventId)
          setAutoFocusNew(false)
        } else {
          // Fallback si por alguna razón no llega el id
          setAutoFocusNew(true)
        }
      }
    })
  }

  // Cuando se crea un nuevo evento (al tope), enfocar su detalle una vez
  useEffect(() => {
    if (autoFocusNew && firstEventId) {
      setSelectedEventId(firstEventId)
      setAutoFocusNew(false)
    }
  }, [autoFocusNew, firstEventId])

  // Captura global de teclado: si no hay foco en inputs, enrutar a la entrada de scanner
  useEffect(() => {
    function isEditableElement(el: Element | null): boolean {
      if (!el) return false
      const tag = (el as HTMLElement).tagName
      const editable = (el as HTMLElement).isContentEditable
      return (
        editable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (isEditableElement(active)) return
      // Ignorar combinaciones con Ctrl/Cmd/Alt
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // Enrutar teclas imprimibles, Backspace y Enter
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
        // Evitar submit vacío
        if (!barcode || barcode.trim() === "") {
          e.preventDefault()
          return
        }
        // disparar submit del form del input
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
  }, [])

  return (
    <main className="min-h-screen md:h-screen p-0">
      <div className="w-full md:h-full grid grid-cols-1 md:grid-cols-2">
        <div className="md:h-full flex flex-col px-6 py-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Inventory</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
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
            <button
              type="submit"
              className="w-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black flex items-center justify-center gap-2"
            >
              Guardar
            </button>
          </form>
          {errorMessage && (
            <div className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</div>
          )}
          {/* Detalle en mobile: se muestra aquí entre input y eventos */}
          <div className="md:hidden">
            <EventDetails eventId={selectedEventId} />
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Eventos</h2>
            <div className="text-xs opacity-80 flex items-center gap-3">
              {(isLoadingBase || isLoadingComposed) && (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Actualizando…</span>
                </div>
              )}
              {pendingQueue.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Pendientes: {pendingQueue.length}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 md:min-h-0 md:overflow-hidden">
            {events.length === 0 ? (
              <div className="text-sm opacity-70">Sin registros</div>
            ) : (
              <EventList
                events={displayEvents as any}
                onSelect={(e) => setSelectedEventId(e.id)}
                barcodeMap={barcodeMap}
                itemMap={itemMap}
              />
            )}
          </div>
        </div>

        <div className="hidden md:block md:h-full px-6 py-6 md:overflow-y-auto">
          <EventDetails eventId={selectedEventId} />
        </div>
      </div>
    </main>
  )
}
