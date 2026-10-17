/**
 * Together Component Library — barrel export
 *
 * Import any component from '@/components/ui' instead of the individual file.
 *
 * @example
 * import { EmptyState, Progress, Badge, Chip } from '@/components/ui'
 */

// ── Buttons ───────────────────────────────────────────────────────────────────
export {
  PrimaryButton, SecondaryButton, GhostButton, DangerButton,
  IconButton, MotionPrimaryButton,
} from './Button'
export type { ButtonVariant, PrimaryButtonProps, SecondaryButtonProps, GhostButtonProps, DangerButtonProps, IconButtonProps, IconButtonVariant } from './Button'

// ── Inputs ────────────────────────────────────────────────────────────────────
export { TextInput, DateInput, TimeInput, CurrencyInput, SearchInput, SelectInput } from './Input'
export type { TextInputProps, CurrencyInputProps, SearchInputProps, SelectInputProps } from './Input'

// ── Textarea ──────────────────────────────────────────────────────────────────
export { Textarea } from './Textarea'
export type { TextareaProps } from './Textarea'

// ── Card ──────────────────────────────────────────────────────────────────────
export { Card, CardSection } from './Card'
export type { CardProps, CardVariant, CardRadius } from './Card'

// ── Badge ─────────────────────────────────────────────────────────────────────
export { Badge } from './Badge'
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge'

// ── Chip ──────────────────────────────────────────────────────────────────────
export { Chip, ChipGroup } from './Chip'
export type { ChipProps } from './Chip'

// ── EmptyState ────────────────────────────────────────────────────────────────
export { EmptyState, DashedEmptyState } from './EmptyState'
export type { EmptyStateProps, DashedEmptyStateProps } from './EmptyState'

// ── Progress ──────────────────────────────────────────────────────────────────
export { Progress, ProgressWithLabel } from './Progress'
export type { ProgressProps, ProgressVariant } from './Progress'

// ── SectionTitle ──────────────────────────────────────────────────────────────
export { SectionTitle } from './SectionTitle'
export type { SectionTitleProps, SectionTitleAction } from './SectionTitle'

// ── Divider ───────────────────────────────────────────────────────────────────
export { Divider } from './Divider'
export type { DividerProps, DividerVariant } from './Divider'

// ── Avatar ────────────────────────────────────────────────────────────────────
export { Avatar } from './Avatar'
export type { AvatarProps, AvatarSize } from './Avatar'

// ── ListItem ──────────────────────────────────────────────────────────────────
export { ListItem } from './ListItem'
export type { ListItemProps } from './ListItem'

// ── Pre-existing shared components ────────────────────────────────────────────
export { C2SectionLabel }  from './C2SectionLabel'
export type { C2SectionLabelProps } from './C2SectionLabel'

// ── Metric Card / Action Row ──────────────────────────────────────────────────
export { C2MetricCard, C2ActionRow } from './C2MetricCard'
export type { C2MetricCardProps, C2ActionRowProps, MetricTrendVariant } from './C2MetricCard'

// ── Sheet system ──────────────────────────────────────────────────────────────
export {
  C2Sheet,
  C2SheetBackdrop,
  C2DragHandle,
  C2CloseButton,
  C2SheetHeader,
  C2SheetBody,
  C2SheetFooter,
  C2SheetSection,
  C2FormField,
} from './C2Sheet'

// ── Dialog ────────────────────────────────────────────────────────────────────
export { C2Dialog } from './C2Dialog'
export type { C2DialogProps } from './C2Dialog'

// ── Skeleton ──────────────────────────────────────────────────────────────────
export { C2Skeleton, C2CardSkeleton, C2ListSkeleton, C2SkeletonText } from './C2Skeleton'

// ── Toast / Feedback ──────────────────────────────────────────────────────────
export { C2ToastRegion, C2InlineError, C2ErrorState } from './C2Toast'
