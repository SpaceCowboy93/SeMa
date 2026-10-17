'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from '@/design/iconSystem'
import { useLightboxStore } from '@/store/useLightboxStore'

export function GlobalImageLightbox() {
  const { isOpen, images, index, close, next, prev } = useLightboxStore()

  // Track whether we've pushed a history entry for the back button
  const didPushHistoryRef = useRef(false)

  // Push history state when lightbox opens so Android back closes it first
  useEffect(() => {
    if (isOpen) {
      history.pushState({ lightboxOpen: true }, '')
      didPushHistoryRef.current = true
    }
  }, [isOpen])

  // popstate fires when user presses the system/browser back button
  useEffect(() => {
    const handler = () => {
      if (didPushHistoryRef.current) {
        didPushHistoryRef.current = false
        close()
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [close])

  // Close lightbox AND pop the history entry we pushed (if any)
  const safeClose = useCallback(() => {
    if (didPushHistoryRef.current) {
      didPushHistoryRef.current = false
      history.back()
    }
    close()
  }, [close])

  // Zoom/pan refs (direct DOM manipulation for perf)
  const scaleRef   = useRef(1)
  const panRef     = useRef({ x: 0, y: 0 })
  const imgWrapRef = useRef<HTMLDivElement>(null)

  // Swipe detection (single touch when NOT zoomed)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  // Pinch zoom
  const lastPinchRef = useRef<number | null>(null)

  // Touch pan (single touch when zoomed)
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)

  // Mouse drag pan
  const mouseDownRef    = useRef(false)
  const mouseDraggedRef = useRef(false)
  const mouseStartRef   = useRef({ x: 0, y: 0 })
  const panAtStartRef   = useRef({ x: 0, y: 0 })

  const applyTransform = useCallback(() => {
    if (!imgWrapRef.current) return
    imgWrapRef.current.style.transform =
      `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scaleRef.current})`
    imgWrapRef.current.style.cursor = scaleRef.current > 1 ? 'grab' : 'default'
  }, [])

  const resetTransform = useCallback(() => {
    scaleRef.current = 1
    panRef.current   = { x: 0, y: 0 }
    applyTransform()
  }, [applyTransform])

  // Reset zoom when image changes
  useEffect(() => { resetTransform() }, [index, resetTransform])

  // Lock scroll on main element while open
  useEffect(() => {
    if (!isOpen) return
    const main = document.querySelector('main') as HTMLElement | null
    if (!main) return
    const saved = main.scrollTop
    main.style.overflowY = 'hidden'
    return () => {
      main.style.overflowY = ''
      main.scrollTop = saved
    }
  }, [isOpen])

  // ESC / arrow keys
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     safeClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft')  prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, safeClose, next, prev])

  // ── Touch: swipe + pinch + pan ──────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchRef.current  = Math.hypot(dx, dy)
      swipeStartRef.current = null
      lastTouchRef.current  = null
    } else {
      lastPinchRef.current  = null
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      lastTouchRef.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchRef.current !== null) {
      // Pinch-to-zoom
      const dx   = e.touches[0].clientX - e.touches[1].clientX
      const dy   = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      scaleRef.current = Math.min(5, Math.max(1, scaleRef.current * (dist / lastPinchRef.current)))
      lastPinchRef.current = dist
      applyTransform()
    } else if (e.touches.length === 1 && scaleRef.current > 1 && lastTouchRef.current) {
      // Single-finger pan when zoomed
      const dx = e.touches[0].clientX - lastTouchRef.current.x
      const dy = e.touches[0].clientY - lastTouchRef.current.y
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      applyTransform()
    }
  }, [applyTransform])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchRef.current = null
    if (e.changedTouches.length === 0 || !swipeStartRef.current) return
    if (scaleRef.current > 1.05) { swipeStartRef.current = null; return } // no swipe when zoomed
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStartRef.current.y)
    if (Math.abs(dx) > 50 && dy < 70) {
      dx < 0 ? next() : prev()
    }
    swipeStartRef.current = null
  }, [next, prev])

  // ── Mouse drag pan (desktop, when zoomed) ──────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scaleRef.current <= 1) return
    e.preventDefault()
    mouseDownRef.current    = true
    mouseDraggedRef.current = false
    mouseStartRef.current   = { x: e.clientX, y: e.clientY }
    panAtStartRef.current   = { ...panRef.current }
    if (imgWrapRef.current) imgWrapRef.current.style.cursor = 'grabbing'
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDownRef.current) return
    const dx = e.clientX - mouseStartRef.current.x
    const dy = e.clientY - mouseStartRef.current.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) mouseDraggedRef.current = true
    panRef.current = { x: panAtStartRef.current.x + dx, y: panAtStartRef.current.y + dy }
    applyTransform()
    if (imgWrapRef.current) imgWrapRef.current.style.cursor = 'grabbing'
  }, [applyTransform])

  const handleMouseUp = useCallback(() => {
    mouseDownRef.current = false
    if (imgWrapRef.current) imgWrapRef.current.style.cursor = scaleRef.current > 1 ? 'grab' : 'default'
  }, [])

  // Prevent close-on-click after a drag
  const handleOverlayClick = useCallback(() => {
    if (mouseDraggedRef.current) { mouseDraggedRef.current = false; return }
    safeClose()
  }, [safeClose])

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    scaleRef.current = Math.max(1, scaleRef.current - 0.5)
    if (scaleRef.current <= 1) panRef.current = { x: 0, y: 0 }
    applyTransform()
  }, [applyTransform])

  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    scaleRef.current = Math.min(5, scaleRef.current + 0.5)
    applyTransform()
  }, [applyTransform])

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    resetTransform()
  }, [resetTransform])

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    prev()
  }, [prev])

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    next()
  }, [next])

  return (
    <AnimatePresence>
      {isOpen && images.length > 0 && (
        <motion.div
          key="global-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[300] bg-black/96 flex items-center justify-center"
          style={{ touchAction: 'none' }}
          onClick={handleOverlayClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Image */}
          <div
            ref={imgWrapRef}
            className="w-full h-full flex items-center justify-center"
            style={{ touchAction: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={images[index]}
              alt=""
              className="max-w-[95vw] max-h-[85vh] object-contain select-none pointer-events-none"
              draggable={false}
            />
          </div>

          {/* Close */}
          <button
            onClick={e => { e.stopPropagation(); safeClose() }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white z-10"
          >
            <X size={18} />
          </button>

          {/* Counter */}
          {images.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/80 text-sm font-medium z-10">
              {index + 1} / {images.length}
            </div>
          )}

          {/* Prev */}
          {index > 0 && (
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white z-10"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Next */}
          {index < images.length - 1 && (
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white z-10"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
            <button
              onClick={handleZoomOut}
              className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-white/80 text-xs font-medium"
            >
              Reset
            </button>
            <button
              onClick={handleZoomIn}
              className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
