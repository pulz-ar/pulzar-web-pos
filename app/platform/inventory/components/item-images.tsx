"use client"

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { deleteItemAttachment, markAttachmentPrimary, uploadItemAttachments } from "../actions"

type FileRef = { id: string; path: string; url: string }

export default function ItemImagesManager({
  files,
  itemId,
  attachments,
  deferUpload = false,
  pendingEntries,
  onPendingChange,
  previewHeightClass = "h-64",
}: {
  files: FileRef[]
  itemId?: string
  attachments?: Array<{ id: string; isPrimary?: boolean; $files?: FileRef[] }>
  deferUpload?: boolean
  pendingEntries?: Array<{ filename: string; base64: string; contentType?: string; previewURL: string; status: 'pending' | 'uploading' | 'done' }>
  onPendingChange?: (entries: Array<{ filename: string; base64: string; contentType?: string; previewURL: string; status: 'pending' | 'uploading' | 'done' }>) => void
  previewHeightClass?: string
}) {
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  type PendingEntry = { filename: string; base64: string; contentType?: string; previewURL: string; status: 'pending' | 'uploading' | 'done' }
  const [pendingFiles, setPendingFiles] = useState<PendingEntry[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isControlled = typeof pendingEntries !== 'undefined' && typeof onPendingChange === 'function'

  const list = files
  const current = list.length ? list[Math.max(0, Math.min(index, list.length - 1))] : null

  const isPrimary = useMemo(() => {
    if (!attachments || !current) return false
    const owner = attachments.find((a) => (a.$files || []).some((f) => f.id === current.id))
    return !!owner?.isPrimary
  }, [attachments, current?.id])

  async function onUploadNow() {
    if (!itemId || pendingFiles.length === 0) return
    startTransition(async () => {
      try {
        if (isControlled) {
          onPendingChange?.((pendingEntries ?? []).map((p) => ({ ...p, status: 'uploading' as const })))
        } else {
          setPendingFiles((prev) => prev.map((p) => ({ ...p, status: 'uploading' as const })))
        }
        await uploadItemAttachments({
          itemId,
          files: pendingFiles.map(({ filename, base64, contentType }) => ({ filename, base64, contentType })),
          kind: "image",
        })
      } finally {
        // Liberar previews
        const toRelease = (pendingEntries ?? pendingFiles)
        toRelease.forEach((p) => URL.revokeObjectURL(p.previewURL))
        if (isControlled) {
          onPendingChange?.([])
        } else {
          setPendingFiles([])
        }
        if (inputRef.current) inputRef.current.value = ""
      }
    })
  }

  async function onDelete() {
    if (!attachments || !current) return
    const owner = attachments.find((a) => (a.$files || []).some((f) => f.id === current.id))
    if (!owner) return
    startTransition(async () => {
      await deleteItemAttachment({ attachmentId: owner.id })
      // no local state mutation; rely on realtime refresh
    })
  }

  async function onMarkPrimary() {
    if (!attachments || !current || !itemId) return
    const owner = attachments.find((a) => (a.$files || []).some((f) => f.id === current.id))
    if (!owner) return
    startTransition(async () => {
      await markAttachmentPrimary({ itemId, attachmentId: owner.id })
    })
  }

  async function readFiles(filesToRead: File[]) {
    const onlyImages = filesToRead.filter((f) => f.type.startsWith("image/"))
    if (onlyImages.length !== filesToRead.length) {
      // ignoramos no-imágenes silenciosamente
    }
    if (!onlyImages.length) return
    const entries = await Promise.all(
      onlyImages.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        const base64 = dataUrl.split(',')[1] || ""
        const previewURL = URL.createObjectURL(file)
        return { filename: file.name, base64, contentType: file.type, previewURL, status: 'pending' as const }
      })
    )
    if (isControlled) {
      const base = pendingEntries ?? []
      onPendingChange?.([...(base as any), ...entries])
    } else {
      setPendingFiles((prev) => [...prev, ...entries])
    }
  }

  async function onSelectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const sel = Array.from(e.target.files || [])
    await readFiles(sel)
  }

  // Drag & Drop
  function onDragOver(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true)
  }
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const filesDropped = Array.from(e.dataTransfer.files || [])
    await readFiles(filesDropped)
  }

  // Keyboard navigation
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!list.length) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault(); setIndex((i) => (i - 1 + list.length) % list.length)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); setIndex((i) => (i + 1) % list.length)
    }
  }

  return (
    <div className="relative w-full" ref={wrapperRef} tabIndex={0} onKeyDown={onKeyDown} role="region" aria-label="Gestor de imágenes">
      <div
        className={`${previewHeightClass} w-full border border-white/20 flex items-center justify-center relative overflow-hidden ${isDragging ? 'outline outline-1 outline-white/60' : ''}`}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {current ? (
          <img src={current.url} alt="item" className="object-contain w-full h-full" />
        ) : (
          <div className="text-xs opacity-60 select-none">
            <div className="border border-dashed border-white/30 px-4 py-6 text-center">
              <div className="inline-flex items-center gap-2 text-[11px] opacity-80">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
                Arrastrá y soltá imágenes aquí
              </div>
              <div className="mt-2 text-[10px] opacity-60">o</div>
              <label className="mt-2 inline-flex items-center justify-center px-2 py-1 border border-white/40 cursor-pointer text-[11px]">
                <input ref={inputRef} type="file" accept="image/*" multiple onChange={onSelectFiles} className="sr-only" />
                Seleccionar archivos
              </label>
            </div>
          </div>
        )}

        {list.length > 1 && (
          <>
            <button
              type="button"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 border border-white/40 text-sm bg-black/30 hover:bg-black/50"
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 border border-white/40 text-sm bg-black/30 hover:bg-black/50"
              onClick={() => setIndex((i) => (i + 1) % list.length)}
            >
              ›
            </button>
          </>
        )}

        {current && (
          <div className="absolute left-1 top-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border border-white/40 bg-black/30">
              {isPrimary ? "Principal" : "Secundaria"}
            </span>
          </div>
        )}

        {list.length > 0 && (
          <div className="absolute right-1 top-1 text-[10px] px-1.5 py-0.5 border border-white/40 bg-black/30">
            {index + 1}/{list.length}
          </div>
        )}

        {itemId && (
          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center justify-center px-3 py-1 text-[11px] tracking-wide border border-white/40 bg-black/30 hover:bg-black/50 cursor-pointer select-none">
                <input ref={inputRef} type="file" accept="image/*" multiple onChange={onSelectFiles} className="sr-only" />
                <span>Agregar</span>
              </label>
              {!deferUpload && pendingFiles.length > 0 && (
                <button
                  type="button"
                  className="px-2 py-1 border border-white/40 text-[10px] bg-black/30 hover:bg-black/50"
                  disabled={isPending}
                  onClick={onUploadNow}
                >
                  {isPending ? "Subiendo…" : `Subir ${pendingFiles.length}`}
                </button>
              )}
            </div>
            {current && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 border border-white/40 text-[10px] bg-black/30 hover:bg-black/50"
                  disabled={isPending}
                  onClick={onMarkPrimary}
                >
                  Marcar principal
                </button>
                <button
                  type="button"
                  className="px-2 py-1 border border-white/40 text-[10px] bg-black/30 hover:bg-black/50"
                  disabled={isPending}
                  onClick={onDelete}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {list.length > 0 && (
        <div className="mt-2 flex items-center gap-1 justify-center">
          {list.map((f, i) => (
            <button
              key={f.id}
              type="button"
              title={f.path}
              className={`h-1.5 w-5 ${i === index ? 'bg-white' : 'bg-white/30'}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Grid de thumbnails para navegación rápida */}
      {list.length > 0 && (
        <div className="mt-3 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {list.map((f, i) => (
            <button
              key={`thumb-${f.id}`}
              type="button"
              className={`relative block border ${i === index ? 'border-white' : 'border-white/20'} hover:border-white/60`}
              onClick={() => setIndex(i)}
            >
              <img src={f.url} alt="thumb" className="object-cover w-full h-12" />
            </button>
          ))}
        </div>
      )}

      {(pendingEntries ?? pendingFiles).length > 0 && (
        <div className="mt-3 border border-dashed border-white/30 p-2">
          <div className="text-xs opacity-80 mb-2">Pendientes para subir</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {(pendingEntries ?? pendingFiles).map((p, idx) => (
              <div key={`pending-${idx}`} className="relative border border-white/20">
                <img src={p.previewURL} alt={p.filename} className="object-cover w-full h-16" />
                <div className="absolute inset-x-0 bottom-0 text-[10px] bg-black/50 px-1 truncate">{p.filename}</div>
                {p.status === 'uploading' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {p.status !== 'uploading' && (
                  <button
                    type="button"
                    title="Quitar"
                    className="absolute top-0 right-0 h-5 w-5 text-xs border border-white/40 bg-black/40"
                    onClick={() => {
                      const base = pendingEntries ?? pendingFiles
                      const next = base.filter((_, i) => i !== idx)
                      if (isControlled) {
                        onPendingChange?.(next as any)
                      } else {
                        setPendingFiles(next as any)
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


