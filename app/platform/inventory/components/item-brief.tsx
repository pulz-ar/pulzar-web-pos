"use client"

import React from "react"

type Item = { id: string; name?: string; description?: string; status?: string }

export default function ItemBrief({ item }: { item: Item }) {
  return (
    <div className="min-w-0 text-xs space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="opacity-60 flex items-center gap-1">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z" />
          </svg>
          Item
        </span>
        <span className="truncate">{item.name || "(Sin título)"}</span>
        {item.status && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            style={{ border: '1px solid var(--border-weak)' }}
          >
            {item.status}
          </span>
        )}
      </div>
      {item.description && <div className="opacity-60 line-clamp-2">{item.description}</div>}
    </div>
  )
}


