'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Zap, LayoutDashboard, Package, Link2, ScrollText,
  Settings, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn, planBadgeClass } from '@/lib/utils'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard',           icon: LayoutDashboard, label: 'Overview'   },
  { href: '/dashboard/inventory', icon: Package,          label: 'Inventory'  },
  { href: '/dashboard/channels',  icon: Link2,            label: 'Channels'   },
  { href: '/dashboard/logs',      icon: ScrollText,       label: 'Sync Logs'  },
  { href: '/dashboard/settings',  icon: Settings,         label: 'Settings'   },
]

export default function Sidebar() {
  const pathname   = usePathname()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col h-full border-r border-border-subtle bg-surface shrink-0 overflow-hidden relative"
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-5 border-b border-border-subtle',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-accent-dim border border-border-bright flex items-center justify-center flex-shrink-0 glow-accent animate-glow-pulse">
          <Zap size={16} className="text-accent" />
        </div>
        {!collapsed && (
          <motion.span
            initial={false}
            animate={{ opacity: 1 }}
            className="font-display font-bold text-sm tracking-tight whitespace-nowrap text-text-primary"
          >
            DESYNC<span className="text-accent">-ZERO</span>
          </motion.span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                collapsed ? 'justify-center px-0 mx-auto w-10 h-10' : '',
                active
                  ? 'bg-accent-dim text-accent border border-border-bright'
                  : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
              )}>
                <Icon size={16} className={cn('flex-shrink-0', active ? 'text-accent' : '')} />
                {!collapsed && <span className="whitespace-nowrap">{label}</span>}
                {active && !collapsed && (
                  <motion.div layoutId="nav-indicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className={cn(
        'border-t border-border-subtle p-3 space-y-2',
        collapsed && 'flex flex-col items-center'
      )}>
        {!collapsed && user && (
          <div className="px-2 py-1.5">
            <div className="text-xs font-medium text-text-primary truncate">{user.email}</div>
            <div className="mt-1">
              <span className={cn('badge text-[10px]', planBadgeClass(user.plan))}>
                {user.plan}
              </span>
            </div>
          </div>
        )}
        <button onClick={logout}
          className={cn(
            'flex items-center gap-2 text-text-muted hover:text-danger transition-colors text-xs py-1.5 px-2 rounded-lg hover:bg-danger/10 w-full',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut size={14} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full bg-elevated border border-border-default flex items-center justify-center text-text-muted hover:text-accent hover:border-border-bright transition-all z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  )
}
