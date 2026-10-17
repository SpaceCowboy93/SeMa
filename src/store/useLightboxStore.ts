import { create } from 'zustand'

interface LightboxStore {
  isOpen: boolean
  images: string[]
  index: number
  open: (images: string[], index?: number) => void
  close: () => void
  next: () => void
  prev: () => void
  setIndex: (i: number) => void
}

export const useLightboxStore = create<LightboxStore>()(set => ({
  isOpen: false,
  images: [],
  index: 0,
  open: (images, index = 0) => set({ isOpen: true, images, index }),
  close: () => set({ isOpen: false }),
  next: () => set(s => ({ index: Math.min(s.images.length - 1, s.index + 1) })),
  prev: () => set(s => ({ index: Math.max(0, s.index - 1) })),
  setIndex: i => set({ index: i }),
}))
