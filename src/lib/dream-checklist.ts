import type { CalendarEvent, EventTodo, Goal } from '@/types'
import { generateId } from './utils'

/** Stable read-only projection for old Dreams; explicit empty lists stay empty. */
export function goalChecklist(goal: Goal, event?: CalendarEvent): EventTodo[] {
  if (goal.checklistItems !== undefined) return goal.checklistItems
  if (goal.checklist?.length === 0) return []
  if (event?.todos !== undefined) return event.todos
  return (goal.checklist ?? []).map((title, index) => ({
    id: `legacy-checklist:${goal.id}:${index}`, title, isCompleted: false,
  }))
}

/** Compatibility for text-only callers. Editors use structured items instead. */
export function reconcileChecklist(titles: string[], previous: EventTodo[]): EventTodo[] {
  const used = new Set<string>()
  const matches = titles.map(title => {
    const item = previous.find(entry => entry.title === title && !used.has(entry.id))
    if (item) used.add(item.id)
    return item
  })
  return titles.map((title, index) => {
    let item = matches[index]
    if (!item && titles.length === previous.length && !used.has(previous[index].id)) {
      item = previous[index]; used.add(item.id)
    }
    return item ? { ...item, title } : { id: generateId(), title, isCompleted: false }
  })
}

export function eventDraftValues(event: CalendarEvent, goal?: Goal) {
  return {
    title: event.title.trim(), date: event.date,
    startTime: event.startTime ?? goal?.startTime ?? '', endTime: event.endTime ?? '',
    notes: (event.notes ?? goal?.notes ?? '').trim(), color: event.color,
    todos: event.todos ?? (goal ? goalChecklist(goal) : []),
    photos: event.photos ?? goal?.photos ?? [],
    backgroundPhoto: event.backgroundPhoto ?? goal?.backgroundPhoto,
  }
}

export function goalDraftValues(goal: Goal, event?: CalendarEvent) {
  return {
    title: goal.title.trim(), notes: (goal.notes ?? '').trim(), targetDate: goal.targetDate ?? '',
    startTime: goal.startTime ?? '', checklistItems: goalChecklist(goal, event), photos: goal.photos ?? [],
  }
}
