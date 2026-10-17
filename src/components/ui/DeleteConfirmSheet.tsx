'use client'

/**
 * DeleteConfirmSheet — confirmation dialog for destructive actions.
 *
 * Migrated to use the shared C2Dialog primitive.
 * Kept as a named export for backward compatibility.
 */

import { Trash2 } from '@/design/iconSystem'
import { C2Dialog } from './C2Dialog'

interface Props {
  open: boolean
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel?: string
}

export default function DeleteConfirmSheet({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = 'Delete',
}: Props) {
  return (
    <C2Dialog
      open={open}
      title={title}
      description={message}
      icon={Trash2}
      iconVariant="danger"
      cancelLabel="Cancel"
      confirmLabel={confirmLabel}
      destructive
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
