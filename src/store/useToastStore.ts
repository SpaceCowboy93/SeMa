import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  /** Auto-dismiss after this many ms. 0 = manual dismiss only. Default 3500. */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: string) => void
  dismissAll: () => void
}

let _seq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show(message, variant = 'success', duration = 3500) {
    const id = `toast-${++_seq}`
    set(s => ({ toasts: [...s.toasts, { id, message, variant, duration }] }))

    if (duration > 0) {
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
      }, duration)
    }
  },

  dismiss(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },

  dismissAll() {
    set({ toasts: [] })
  },
}))

/** Convenience helper for use outside React components. */
export const toast = {
  success: (msg: string, duration?: number) =>
    useToastStore.getState().show(msg, 'success', duration),
  error:   (msg: string, duration?: number) =>
    useToastStore.getState().show(msg, 'error', duration),
  warning: (msg: string, duration?: number) =>
    useToastStore.getState().show(msg, 'warning', duration),
  info:    (msg: string, duration?: number) =>
    useToastStore.getState().show(msg, 'info', duration),
}
