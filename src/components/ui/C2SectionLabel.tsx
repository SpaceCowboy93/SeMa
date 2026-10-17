import { cn } from '@/lib/utils'

export interface C2SectionLabelProps extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: 'p' | 'h2' | 'h3' | 'span'
}

/**
 * C2SectionLabel — shared section/eyebrow label.
 *
 * Replaces the 30 repeated instances of:
 *   className="text-[10px] font-semibold tracking-widest uppercase"
 *   style={{ color: '#a8b0a0' }}
 *
 * Usage:
 *   <C2SectionLabel>Upcoming dates</C2SectionLabel>
 */
export function C2SectionLabel({
  as: Tag = 'p',
  className,
  children,
  ...rest
}: C2SectionLabelProps) {
  return (
    <Tag
      className={cn('c2-label', className)}
      {...rest}
    >
      {children}
    </Tag>
  )
}
