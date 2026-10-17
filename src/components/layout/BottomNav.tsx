'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconNavHome, IconNavPlanner, IconNavFinances, IconNavShopping, IconNavUs } from '@/design/iconSystem'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/together',  label: 'Home',     icon: IconNavHome     },
  { href: '/planner',   label: 'Planner',  icon: IconNavPlanner  },
  { href: '/plans',     label: 'Finances', icon: IconNavFinances  },
  { href: '/shopping',  label: 'Shopping', icon: IconNavShopping  },
  { href: '/us',        label: 'Us',       icon: IconNavUs        },
]

export function BottomNav() {
  const pathname    = usePathname()
  const currentUser = useAppStore(s => s.currentUser)

  const isSeval     = currentUser === 'seval'
  const activeColor = isSeval ? '#8b5cf6' : '#14b8a6'

  return (
    <nav aria-label="Main navigation" className="glass-nav fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="flex items-center justify-around px-1 h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full
                         relative active:opacity-70 transition-opacity min-w-0"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute top-1.5 w-1 h-1 rounded-full"
                  style={{ background: activeColor }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.7}
                color={isActive ? activeColor : '#9ca3af'}
                aria-hidden="true"
              />
              <span
                className={cn('text-[10px] font-medium transition-colors leading-none truncate w-full text-center', {
                  'font-semibold': isActive,
                })}
                style={{ color: isActive ? activeColor : '#9ca3af' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
