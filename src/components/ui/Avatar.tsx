'use client'

import { UserRound } from '@/design/iconSystem'
import { cn } from '@/lib/utils'
import type { UserName } from '@/types'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

export interface AvatarProps {
  /** UserName for color theming. */
  user?: UserName
  /** Override icon background color. */
  color?: string
  size?: AvatarSize
  className?: string
}

const SIZE: Record<AvatarSize, { container: string; icon: number }> = {
  xs: { container: 'w-6  h-6',  icon: 12 },
  sm: { container: 'w-8  h-8',  icon: 16 },
  md: { container: 'w-10 h-10', icon: 20 },
  lg: { container: 'w-14 h-14', icon: 26 },
}

const USER_COLOR: Record<UserName, string> = {
  seval: '#8b5cf6',
  mateo: '#14b8a6',
}

/**
 * Avatar — user icon representation.
 *
 * Renders a UserRound icon inside a soft-tinted circle,
 * colored by the user's theme (seval = violet, mateo = teal).
 *
 * @example
 * <Avatar user="seval" size="md" />
 * <Avatar color="#9EC9B3" size="sm" />
 */
export function Avatar({ user, color, size = 'md', className }: AvatarProps) {
  const resolvedColor = color ?? (user ? USER_COLOR[user] : '#9EC9B3')
  const { container, icon } = SIZE[size]

  return (
    <div
      className={cn('rounded-full flex items-center justify-center shrink-0', container, className)}
      style={{
        background: `${resolvedColor}1A`,
        color: resolvedColor,
      }}
    >
      <UserRound size={icon} strokeWidth={1.75} />
    </div>
  )
}
