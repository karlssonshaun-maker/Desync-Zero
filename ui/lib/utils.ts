import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatDate(date: string) {
  return format(new Date(date), 'dd MMM yyyy, HH:mm')
}

export function formatZAR(cents: number) {
  return `R${(cents / 100).toFixed(0)}`
}

export function stockColor(available: number, total: number): string {
  if (total === 0) return 'text-text-muted'
  const pct = available / total
  if (pct <= 0) return 'text-danger'
  if (pct <= 0.2) return 'text-warning'
  return 'text-success'
}

export function stockBadgeClass(available: number): string {
  if (available === 0) return 'badge-danger'
  if (available <= 5) return 'badge-warning'
  return 'badge-success'
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'success':    return 'badge-success'
    case 'failed':     return 'badge-danger'
    case 'retrying':   return 'badge-warning'
    case 'dead_letter':return 'badge-danger'
    case 'pending':    return 'badge-muted'
    default:           return 'badge-muted'
  }
}

export function planBadgeClass(plan: string): string {
  return `badge-${plan}`
}

export function channelIcon(channel: string): string {
  switch (channel) {
    case 'takealot': return '🛒'
    case 'amazon':   return '📦'
    case 'shopify':  return '🏪'
    default:         return '🔗'
  }
}
