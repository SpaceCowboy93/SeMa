'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pin, Trash2, Send, Heart, Mail } from '@/design/iconSystem'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useAppStore } from '@/store/useAppStore'
import { USERS } from '@/types'
import { cn } from '@/lib/utils'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'

export default function NotesPage() {
  const currentUser  = useAppStore(s => s.currentUser)!
  const loveNotes    = useAppStore(s => s.loveNotes)
  const addLoveNote  = useAppStore(s => s.addLoveNote)
  const deleteLoveNote = useAppStore(s => s.deleteLoveNote)
  const togglePinNote  = useAppStore(s => s.togglePinNote)

  const [text, setText]       = useState('')
  const [showInput, setShowInput] = useState(false)
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null)

  const isSeval      = currentUser === 'seval'
  const primaryColor = isSeval ? '#8b5cf6' : '#14b8a6'
  const lightBg      = isSeval ? 'bg-seval-50'  : 'bg-mateo-50'
  const borderColor  = isSeval ? 'border-seval-200' : 'border-mateo-200'

  const sorted = [...loveNotes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  function handleSend() {
    if (!text.trim()) return
    addLoveNote(text.trim())
    setText('')
    setShowInput(false)
  }

  const noteColors: Record<string, { bg: string; border: string }> = {
    seval: { bg: 'bg-seval-50', border: 'border-seval-200' },
    mateo: { bg: 'bg-mateo-50', border: 'border-mateo-200' },
  }

  return (
    <div className="min-h-screen px-4 pt-14">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Love Notes</h1>
          <p className="text-sm text-gray-400 mt-0.5">little messages for each other</p>
        </div>
        <button
          onClick={() => setShowInput(!showInput)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-soft
                     active:scale-90 transition-transform"
          style={{ background: primaryColor }}
        >
          <Heart size={18} fill="white" />
        </button>
      </div>

      {/* Compose */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className={cn('rounded-3xl border-2 p-4', lightBg, borderColor)}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Write something sweet..."
                rows={3}
                autoFocus
                className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent
                           outline-none resize-none"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => { setShowInput(false); setText('') }}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!text.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs
                             font-semibold disabled:opacity-40 active:scale-95 transition-transform"
                  style={{ background: primaryColor }}
                >
                  <Send size={13} />
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes list */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No notes yet"
          description="Tap the heart button to write your first love note"
          className="pt-20"
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sorted.map(note => {
              const colors = noteColors[note.from] ?? noteColors.seval
              const isFromMe = note.from === currentUser
              const author = USERS[note.from]

              return (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    'rounded-3xl p-5 border-2 relative group',
                    colors.bg, colors.border
                  )}
                >
                  {note.isPinned && (
                    <div className="absolute top-3 right-3">
                      <Pin size={14} className="text-gray-400" fill="currentColor" />
                    </div>
                  )}

                  {/* Author */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{author.emoji}</span>
                    <span className="text-xs font-semibold text-gray-500">
                      {isFromMe ? 'You' : author.displayName}
                    </span>
                    <span className="text-xs text-gray-300 ml-auto pr-5">
                      {formatDistanceToNow(parseISO(note.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {note.content}
                  </p>

                  {/* Actions */}
                  <div className="flex gap-3 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => togglePinNote(note.id)}
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium transition-colors',
                        note.isPinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'
                      )}
                    >
                      <Pin size={13} />
                      {note.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    {isFromMe && (
                      <button
                        onClick={() => setDeleteNoteId(note.id)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-400
                                   hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <DeleteConfirmSheet
        open={!!deleteNoteId}
        title="Delete this note?"
        message="This love note will be permanently removed."
        onCancel={() => setDeleteNoteId(null)}
        onConfirm={() => { deleteLoveNote(deleteNoteId!); setDeleteNoteId(null) }}
      />
    </div>
  )
}
