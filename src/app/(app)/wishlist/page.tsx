'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, X, Sparkles } from '@/design/iconSystem'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAppStore } from '@/store/useAppStore'
import { type WishlistItem, type WishlistCategory } from '@/types'
import { WISHLIST_CATEGORY_CONFIG, cn } from '@/lib/utils'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { C2SheetHeader, C2SheetBody, C2SheetFooter, C2CloseButton } from '@/components/ui'

const CATEGORIES = Object.entries(WISHLIST_CATEGORY_CONFIG) as [
  WishlistCategory,
  { emoji: string; label: string }
][]

export default function WishlistPage() {
  const currentUser        = useAppStore(s => s.currentUser)!
  const wishlistItems      = useAppStore(s => s.wishlistItems)
  const addWishlistItem    = useAppStore(s => s.addWishlistItem)
  const toggleWishlistItem = useAppStore(s => s.toggleWishlistItem)
  const updateWishlistItem = useAppStore(s => s.updateWishlistItem)
  const deleteWishlistItem = useAppStore(s => s.deleteWishlistItem)

  const [showForm, setShowForm]         = useState(false)
  const [newTitle, setNewTitle]         = useState('')
  const [newCategory, setNewCategory]   = useState<WishlistCategory>('date')
  const [newNotes, setNewNotes]         = useState('')
  const [activeFilter, setActiveFilter] = useState<WishlistCategory | 'all'>('all')
  const [detailItem, setDetailItem]     = useState<WishlistItem | null>(null)
  const [deleteWishId, setDeleteWishId] = useState<string | null>(null)

  const isSeval      = currentUser === 'seval'
  const primaryColor = isSeval ? '#8b5cf6' : '#14b8a6'
  const lightBg      = isSeval ? 'bg-seval-50' : 'bg-mateo-50'

  function handleAdd() {
    if (!newTitle.trim()) return
    addWishlistItem(newTitle.trim(), newCategory, newNotes.trim() || undefined)
    setNewTitle('')
    setNewNotes('')
    setNewCategory('date')
    setShowForm(false)
  }

  const filtered  = wishlistItems.filter(i => activeFilter === 'all' || i.category === activeFilter)
  const pending   = filtered.filter(i => !i.isCompleted)
  const completed = filtered.filter(i => i.isCompleted)

  return (
    <div className="min-h-screen px-4 pt-14">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Our Wishes</h1>
          <p className="text-sm text-gray-400 mt-0.5">dreams waiting to happen</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          aria-label={showForm ? 'Close wish form' : 'Add wish'}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-soft
                     active:scale-90 transition-transform"
          style={{ background: primaryColor }}
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className={cn('rounded-3xl p-4', lightBg)}>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="What do you wish for?"
                autoFocus
                className="w-full text-sm text-gray-700 placeholder:text-gray-400 bg-transparent
                           outline-none border-b border-gray-200 pb-2 mb-3"
              />
              {/* Category picker */}
              <div className="flex gap-2 flex-wrap mb-3">
                {CATEGORIES.map(([cat, cfg]) => (
                  <button
                    key={cat}
                    onClick={() => setNewCategory(cat)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                      newCategory === cat ? 'text-white shadow-sm' : 'bg-white text-gray-500'
                    )}
                    style={newCategory === cat ? { background: primaryColor } : {}}
                  >
                    <span>{cfg.emoji}</span>
                    {cfg.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full text-xs text-gray-500 placeholder:text-gray-300 bg-transparent
                           outline-none mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowForm(false); setNewTitle(''); setNewNotes(''); setNewCategory('date') }}
                  className="flex-1 py-2.5 rounded-2xl bg-white text-gray-500 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newTitle.trim()}
                  className="flex-1 py-2.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-40"
                  style={{ background: primaryColor }}
                >
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
            activeFilter === 'all' ? 'text-white' : 'bg-white text-gray-500 shadow-card'
          )}
          style={activeFilter === 'all' ? { background: primaryColor } : {}}
        >
          All
        </button>
        {CATEGORIES.map(([cat, cfg]) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              'shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
              activeFilter === cat ? 'text-white' : 'bg-white text-gray-500 shadow-card'
            )}
            style={activeFilter === cat ? { background: primaryColor } : {}}
          >
            <span>{cfg.emoji}</span>
            {cfg.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {wishlistItems.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Your wishlist awaits"
          description="Add wishes, date ideas, dreams..."
          className="pt-16"
        />
      ) : (
        <>
          <AnimatePresence mode="popLayout">
            {pending.map(item => (
              <WishlistCard
                key={item.id}
                item={item}
                onTap={() => setDetailItem(item)}
                onToggle={() => toggleWishlistItem(item.id)}
                onDelete={() => setDeleteWishId(item.id)}
                primaryColor={primaryColor}
              />
            ))}
          </AnimatePresence>

          {completed.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Made real ✨ ({completed.length})
              </p>
              <AnimatePresence mode="popLayout">
                {completed.map(item => (
                  <WishlistCard
                    key={item.id}
                    item={item}
                    onTap={() => setDetailItem(item)}
                    onToggle={() => toggleWishlistItem(item.id)}
                    onDelete={() => setDeleteWishId(item.id)}
                    primaryColor={primaryColor}
                    isDone
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <DeleteConfirmSheet
        open={!!deleteWishId}
        title="Delete this wish?"
        message="This wish will be permanently removed."
        onCancel={() => setDeleteWishId(null)}
        onConfirm={() => { deleteWishlistItem(deleteWishId!); setDeleteWishId(null) }}
      />

      {/* Detail / edit modal */}
      <AnimatePresence>
        {detailItem && (
          <WishDetailModal
            item={detailItem}
            primaryColor={primaryColor}
            lightBg={lightBg}
            onClose={() => setDetailItem(null)}
            onSave={updates => {
              updateWishlistItem(detailItem.id, updates)
              setDetailItem(null)
            }}
            onDelete={() => {
              deleteWishlistItem(detailItem.id)
              setDetailItem(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Wishlist card ─────────────────────────────────────────────────────────── */
function WishlistCard({
  item, onTap, onToggle, onDelete, primaryColor, isDone,
}: {
  item: WishlistItem
  onTap: () => void
  onToggle: () => void
  onDelete: () => void
  primaryColor: string
  isDone?: boolean
}) {
  const cat = WISHLIST_CATEGORY_CONFIG[item.category]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={onTap}
      className="flex items-start gap-3 bg-white rounded-2xl p-4 mb-2 shadow-card group
                 active:scale-[0.98] transition-transform cursor-pointer"
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        aria-label={isDone ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5
                   transition-all active:scale-90"
        style={{
          borderColor: isDone ? primaryColor : '#d1d5db',
          background:  isDone ? primaryColor : 'transparent',
        }}
      >
        {isDone && <Check size={13} color="white" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        {/* Category badge */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs">{cat.emoji}</span>
          <span className="text-[10px] text-gray-400 font-medium">{cat.label}</span>
        </div>
        <p className={cn('text-sm font-medium', isDone ? 'line-through text-gray-300' : 'text-gray-700')}>
          {item.title}
        </p>
        {item.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        aria-label={`Delete "${item.title}"`}
        className="opacity-0 group-hover:opacity-100 text-gray-300 active:text-red-400
                   transition-all shrink-0 mt-0.5"
      >
        <Trash2 size={15} />
      </button>
    </motion.div>
  )
}

/* ─── Detail / edit modal ────────────────────────────────────────────────────── */
function WishDetailModal({
  item, primaryColor, lightBg, onClose, onSave, onDelete,
}: {
  item: WishlistItem
  primaryColor: string
  lightBg: string
  onClose: () => void
  onSave: (updates: Partial<WishlistItem>) => void
  onDelete: () => void
}) {
  const [title, setTitle]       = useState(item.title)
  const [category, setCategory] = useState<WishlistCategory>(item.category)
  const [notes, setNotes]       = useState(item.notes ?? '')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const cat = WISHLIST_CATEGORY_CONFIG[category]
  const hasChanges =
    title !== item.title || category !== item.category || notes !== (item.notes ?? '')

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 c2-backdrop"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="fixed bottom-0 left-0 right-0 z-50 c2-sheet-bg rounded-t-[2rem] shadow-modal max-w-lg mx-auto flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
      >
        <C2SheetHeader onClose={onClose}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{cat.emoji}</span>
              <span className="text-sm font-medium text-gray-400">{cat.label}</span>
            </div>
            <C2CloseButton onClose={onClose} />
          </div>
        </C2SheetHeader>

        <C2SheetBody className="pb-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Wish title..."
            className="w-full text-xl font-semibold text-gray-800 placeholder:text-gray-300
                       border-b-2 border-gray-100 focus:border-gray-200 pb-3 mb-5 outline-none
                       transition-colors bg-transparent"
            autoFocus
          />

          {/* Category */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Category</p>
          <div className="flex gap-2 flex-wrap mb-5">
            {CATEGORIES.map(([cat, cfg]) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  category === cat ? 'text-white shadow-sm' : 'bg-gray-50 text-gray-500'
                )}
                style={category === cat ? { background: primaryColor } : {}}
              >
                <span>{cfg.emoji}</span>
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Notes / content */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Notes</p>
          <div className={cn('rounded-2xl p-4', lightBg)}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add details, links, ideas..."
              rows={5}
              className="w-full text-sm text-gray-700 placeholder:text-gray-300 bg-transparent
                         outline-none resize-none"
            />
          </div>
        </C2SheetBody>

        <C2SheetFooter>
          {hasChanges && (
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSave({ title: title.trim(), category, notes: notes.trim() || undefined })}
              disabled={!title.trim()}
              className="w-full py-4 rounded-2xl text-white text-sm font-semibold mb-3 disabled:opacity-40
                         transition-opacity"
              style={{ background: primaryColor }}
            >
              Save Changes
            </motion.button>
          )}

          <button
            onClick={() => setShowConfirmDelete(true)}
            className="w-full py-3 rounded-2xl text-sm font-medium text-red-400 active:bg-red-50 transition-colors"
          >
            Delete Wish
          </button>
        </C2SheetFooter>
      </motion.div>

      <DeleteConfirmSheet
        open={showConfirmDelete}
        title="Delete this wish?"
        message="This can't be undone."
        onCancel={() => setShowConfirmDelete(false)}
        onConfirm={onDelete}
      />
    </>
  )
}
