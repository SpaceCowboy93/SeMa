'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

/**
 * Textarea — consistent multi-line input matching TextInput visual style.
 *
 * Same padding, radius, font-size and placeholder colour as TextInput.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, error, rows = 3, ...rest }, ref) {
    return (
      <div className="w-full">
        <textarea
          ref={ref}
          rows={rows}
          className={cn(
            'w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-700 ',
            'placeholder:text-gray-300 outline-none resize-none leading-relaxed ',
            'transition-[background] duration-150',
            error && 'ring-1 ring-[#D88A8A]',
            className,
          )}
          {...rest}
        />
        {error && (
          <p className="text-xs text-[#D88A8A] mt-1 px-1">{error}</p>
        )}
      </div>
    )
  },
)
