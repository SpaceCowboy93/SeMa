'use client'

import { authenticatedFetch } from '@/lib/authenticated-fetch'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Camera, ImageIcon, Trash2, ScanLine, Plus, Loader2 } from '@/design/iconSystem'
import { useAppStore } from '@/store/useAppStore'
import { type ReceiptResult } from '@/types'
import { cn } from '@/lib/utils'

async function resizeImage(file: File, maxPx = 1200): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w      = Math.round(img.width  * scale)
      const h      = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.src = url
  })
}

interface Props {
  onClose: () => void
  onResultReady: (result: ReceiptResult, photos: string[]) => void
}

export function ReceiptScannerSheet({ onClose, onResultReady }: Props) {
  const currentUser = useAppStore(s => s.currentUser)
  const primary     = currentUser === 'seval' ? '#8b5cf6' : '#14b8a6'

  const [photos,    setPhotos]    = useState<string[]>([])
  const [scanning,  setScanning]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    const arr = Array.from(files)
    const resized = await Promise.all(arr.map(f => resizeImage(f)))
    setPhotos(p => [...p, ...resized])
  }

  function removePhoto(idx: number) {
    setPhotos(p => p.filter((_, i) => i !== idx))
  }

  async function handleScan() {
    if (photos.length === 0) return
    setScanning(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/receipts/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ photos }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const result: ReceiptResult = await res.json()
      onResultReady(result, photos)
    } catch (e) {
      setError('Could not read the receipt. Try a clearer photo or enter manually.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] c2-backdrop"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
        className="fixed bottom-0 left-0 right-0 z-[80] c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto max-h-[88vh] overflow-y-auto"
      >
        <div className="px-5 pt-4 pb-12">
          <div className="drag-handle mb-5" />

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Scan Receipt</h2>
              <p className="text-xs text-gray-400 mt-0.5">Add one or more photos of your receipt</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full c2-sheet-x"
            >
              <X size={16} />
            </button>
          </div>

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <AnimatePresence>
                  {photos.map((src, i) => (
                    <motion.div
                      key={i}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative shrink-0"
                    >
                      <img
                        src={src}
                        alt={`Receipt ${i + 1}`}
                        className="w-28 h-36 object-cover rounded-2xl border border-gray-100"
                      />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
                      >
                        <X size={11} color="white" />
                      </button>
                      {i === 0 && photos.length > 1 && (
                        <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full">
                          COVER
                        </span>
                      )}
                    </motion.div>
                  ))}

                  {/* Add more */}
                  <motion.button
                    key="add-more"
                    layout
                    onClick={() => galleryRef.current?.click()}
                    className="w-28 h-36 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 active:opacity-70"
                  >
                    <Plus size={20} />
                    <span className="text-[10px] font-medium">Add more</span>
                  </motion.button>
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Upload buttons (shown when no photos or always) */}
          {photos.length === 0 && (
            <div className="space-y-2 mb-5">
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl active:opacity-80 transition-opacity"
                style={{ background: `${primary}10` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: primary }}
                >
                  <Camera size={18} color="white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">Take a photo</p>
                  <p className="text-xs text-gray-400">Open camera to capture the receipt</p>
                </div>
              </button>

              <button
                onClick={() => galleryRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-gray-50 active:opacity-80 transition-opacity"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center shrink-0">
                  <ImageIcon size={18} color="#6b7280" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-800">Choose from gallery</p>
                  <p className="text-xs text-gray-400">Select one or more photos</p>
                </div>
              </button>
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mb-4 px-4 py-3 rounded-2xl bg-red-50 text-sm text-red-600"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons when photos present */}
          {photos.length > 0 && (
            <div className="space-y-2 mb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium active:opacity-70"
                >
                  <Camera size={15} /> Camera
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium active:opacity-70"
                >
                  <ImageIcon size={15} /> Gallery
                </button>
                <button
                  onClick={() => setPhotos([])}
                  className="w-12 flex items-center justify-center py-3 rounded-xl bg-red-50 text-red-400 active:opacity-70"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleScan}
                disabled={scanning}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white text-sm font-semibold',
                  scanning && 'opacity-70'
                )}
                style={{ background: primary }}
              >
                {scanning
                  ? <><Loader2 size={16} className="animate-spin" /> Scanning…</>
                  : <><ScanLine size={16} /> Scan {photos.length > 1 ? `${photos.length} photos` : 'receipt'}</>
                }
              </motion.button>
            </div>
          )}
        </div>

        {/* Hidden inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </motion.div>
    </>
  )
}
