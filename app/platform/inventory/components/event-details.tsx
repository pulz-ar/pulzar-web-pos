"use client"

import React from "react"
import { init } from "@instantdb/react"
import EventScannerRead from "../event-scanner-read"

const db = init({ appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID! })

export default function EventDetails({ eventId }: { eventId: string | null }) {
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
  const ev = (data?.events?.[0] ?? null) as
    | { id: string; type: string; content: any; createdAt?: string; serverCreatedAt?: string | number }
    | null
  if (!ev) {
    return <div className="text-sm opacity-70">Evento no encontrado</div>
  }
  if (ev.type === "scanner.read") {
    return <EventScannerRead eventId={ev.id} />
  }
  return <div className="text-sm opacity-70">Sin detalles para este tipo de evento</div>
}


