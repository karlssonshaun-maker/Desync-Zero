'use client'
import { usePathname } from 'next/navigation'
import { RefreshCw, Bell } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn, planBadgeClass } from '@/lib/utils'
import { useState } from 'react'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Overview',
  '/dashboard/inventory':  'Inventory',
  '/dashboard/channels':   'Channels',
  '/dashboard/logs':       'Sync Logs',
  '/dashboard/settings':   'Settings',
}

export default function TopBar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [status, setStatus] = useState<'ok' | 'degraded' | null>(null)
  const [checking, setChecking] = useState(false)

  const checkHealth = async () => {
    setChecking(true)
    try {
      const h = await api.health()
      setStatus(h.status === 'healthy' ? 'ok' : 'degraded')
      if (h.status === 'healthy') {
        toast.success(`All systems operational — v${h.version}`)
      } else {
        toast.error(`System degraded — DB:${h.database} Redis:${h.redis}`)
      }
    } catch {
      setStatus('degraded')
      toast.error('Cannot reach backend')
    } finally {
      setChecking(false)
    }
  }

  const title = PAGE_TITLES[pathname] || 'Dashboard'

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border-subtle bg-surface/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="font-display font-semibold text-base text-text-primary">{title}</h1>
        {status && (
          <span className={cn('badge text-[10px]', status === 'ok' ? 'badge-success' : 'badge-danger')}>
            <span className={cn('status-dot', status === 'ok' ? 'status-dot-success' : 'status-dot-danger')} />
            {status === 'ok' ? 'Operational' : 'Degraded'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={checkHealth} disabled={checking}
          className={cn('btn-ghost text-xs', checking && 'opacity-50 cursor-not-allowed')}>
          <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
          {!checking && <span className="hidden sm:inline">Health</span>}
        </button>

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-border-subtle">
            <div className="w-7 h-7 rounded-full bg-accent-dim border border-border-bright flex items-center justify-center">
              <span className="text-accent text-xs font-bold font-display">
                {user.email[0].toUpperCase()}
              </span>
            </div>
            <span className={cn('badge text-[10px] hidden sm:flex', planBadgeClass(user.plan))}>
              {user.plan}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
