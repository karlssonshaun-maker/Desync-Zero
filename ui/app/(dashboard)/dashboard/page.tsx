'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Package, Link2, ShoppingCart, Activity, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, ArrowUpRight, Zap,
  Clock, TrendingUp, Server,
} from 'lucide-react'
import Link from 'next/link'
import CountUp from 'react-countup'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, CartesianGrid,
} from 'recharts'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { cn, statusBadgeClass, channelIcon, formatRelative, stockBadgeClass } from '@/lib/utils'
import type { UsageSummary, InventoryItem, SyncLog, HealthStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardData {
  usage:    UsageSummary | null
  inventory: InventoryItem[]
  logs:     SyncLog[]
  health:   HealthStatus | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function usagePct(used: number, limit: number | 'unlimited') {
  if (limit === 'unlimited') return 0
  return Math.min(Math.round((used / limit) * 100), 100)
}

function usageBarColor(pct: number) {
  if (pct >= 90) return '#ff4d4d'
  if (pct >= 70) return '#ffab40'
  return '#00d4ff'
}

// Build a 7-day sparkline from sync logs
function buildSparkline(logs: SyncLog[]) {
  const days: Record<string, { success: number; failed: number }> = {}
  const now = Date.now()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000)
    days[d.toLocaleDateString('en-ZA', { weekday: 'short' })] = { success: 0, failed: 0 }
  }
  logs.forEach(l => {
    const key = new Date(l.created_at).toLocaleDateString('en-ZA', { weekday: 'short' })
    if (key in days) {
      if (l.status === 'success') days[key].success++
      else if (l.status === 'failed' || l.status === 'dead_letter') days[key].failed++
    }
  })
  return Object.entries(days).map(([day, v]) => ({ day, ...v }))
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  used,
  limit,
  color,
  href,
  delay = 0,
}: {
  icon: React.ElementType
  label: string
  used: number
  limit: number | 'unlimited'
  color: string
  href: string
  delay?: number
}) {
  const pct = usagePct(used, limit)
  const barColor = usageBarColor(pct)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Link href={href}>
        <div className="card card-hover p-5 cursor-pointer group">
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${color}18`, border: `1px solid ${color}40` }}
            >
              <Icon size={18} style={{ color }} />
            </div>
            <ArrowUpRight
              size={14}
              className="text-text-muted group-hover:text-accent transition-colors mt-1"
            />
          </div>
          <div className="mb-1">
            <span className="font-mono-num text-3xl font-bold text-text-primary">
              <CountUp end={used} duration={1.2} separator="," />
            </span>
            <span className="text-text-muted text-sm ml-2">
              {limit === 'unlimited' ? '/ ∞' : `/ ${limit.toLocaleString()}`}
            </span>
          </div>
          <div className="text-xs text-text-muted mb-3">{label}</div>

          {limit !== 'unlimited' && (
            <div className="w-full h-1 rounded-full bg-elevated overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
          )}
          {limit !== 'unlimited' && (
            <div className="text-right mt-1 text-[10px] font-mono-num" style={{ color: barColor }}>
              {pct}%
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

function HealthDot({ status }: { status: 'healthy' | 'degraded' | undefined }) {
  if (status === undefined) return <span className="status-dot status-dot-muted" />
  return (
    <span
      className={cn(
        'status-dot',
        status === 'healthy' ? 'status-dot-success' : 'status-dot-danger',
      )}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData>({ usage: null, inventory: [], logs: [], health: null })
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [usage, health, logsRes, inventory] = await Promise.allSettled([
        api.getUsage(),
        api.health(),
        api.getSyncLogs({ limit: 50 }),
        api.listInventory(),
      ])

      setData({
        usage:     usage.status     === 'fulfilled' ? usage.value       : null,
        health:    health.status    === 'fulfilled' ? health.value      : null,
        logs:      logsRes.status   === 'fulfilled' ? logsRes.value.items : [],
        inventory: inventory.status === 'fulfilled' ? inventory.value   : [],
      })
      setLastSync(new Date())
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { usage, health, logs, inventory } = data

  const sparkline     = buildSparkline(logs)
  const recentLogs    = logs.slice(0, 8)
  const lowStock      = inventory.filter(i => i.available_qty <= 5).slice(0, 6)
  const successRate   = logs.length
    ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100)
    : 0
  const failedCount   = logs.filter(l => l.status === 'failed' || l.status === 'dead_letter').length
  const retryingCount = logs.filter(l => l.status === 'retrying').length

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Overview</h1>
          <div className="flex items-center gap-2 mt-1">
            <HealthDot status={health?.status} />
            <span className="text-xs text-text-muted">
              {health?.status === 'healthy'
                ? 'All systems operational'
                : health?.status === 'degraded'
                ? 'System degraded — check services'
                : 'Connecting…'}
            </span>
            {lastSync && (
              <span className="text-text-muted text-xs">
                · refreshed {formatRelative(lastSync.toISOString())}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost text-xs gap-2 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Usage Stats ─────────────────────────────────────────────────────── */}
      {loading && !usage ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-10 w-20 rounded mb-3" />
              <div className="skeleton h-3 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : usage ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={ShoppingCart}
            label="Orders this month"
            used={usage.orders_this_month.used}
            limit={usage.orders_this_month.limit}
            color="#00d4ff"
            href="/dashboard/logs"
            delay={0}
          />
          <StatCard
            icon={Package}
            label="Active SKUs"
            used={usage.active_skus.used}
            limit={usage.active_skus.limit}
            color="#bb86fc"
            href="/dashboard/inventory"
            delay={0.08}
          />
          <StatCard
            icon={Link2}
            label="Active channels"
            used={usage.active_channels.used}
            limit={usage.active_channels.limit}
            color="#00e676"
            href="/dashboard/channels"
            delay={0.16}
          />
        </div>
      ) : null}

      {/* ── Sync Activity + Low Stock ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Sparkline chart */}
        <motion.div
          className="card p-5 lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">Sync activity</span>
                <span className="text-xs text-text-muted">(last 7 days)</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                <span className="text-text-muted">Success</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-danger inline-block" />
                <span className="text-text-muted">Failed</span>
              </span>
            </div>
          </div>

          {loading ? (
            <div className="skeleton h-36 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={sparkline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00e676" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff4d4d" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#ff4d4d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,88,160,0.12)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: '#3d5070', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0d1425',
                    border: '1px solid rgba(48,88,160,0.35)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#e8f0fe',
                  }}
                  cursor={{ stroke: 'rgba(0,212,255,0.15)', strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="success"
                  stroke="#00e676"
                  strokeWidth={2}
                  fill="url(#gSuccess)"
                  dot={false}
                  name="Success"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stroke="#ff4d4d"
                  strokeWidth={2}
                  fill="url(#gFailed)"
                  dot={false}
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Summary row */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-border-subtle">
            <div className="text-center">
              <div className="font-mono-num text-lg font-bold text-success">{successRate}%</div>
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Success rate</div>
            </div>
            <div className="text-center">
              <div className="font-mono-num text-lg font-bold text-danger">{failedCount}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Failed</div>
            </div>
            <div className="text-center">
              <div className="font-mono-num text-lg font-bold text-warning">{retryingCount}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Retrying</div>
            </div>
            <div className="text-center">
              <div className="font-mono-num text-lg font-bold text-text-primary">{logs.length}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Total events</div>
            </div>
          </div>
        </motion.div>

        {/* Low stock alerts */}
        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-warning" />
              <span className="text-sm font-medium text-text-primary">Low stock</span>
              {lowStock.length > 0 && (
                <span className="badge badge-warning text-[10px] py-0.5 px-2">{lowStock.length}</span>
              )}
            </div>
            <Link href="/dashboard/inventory" className="text-xs text-accent hover:text-accent/80 transition-colors">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
            </div>
          ) : lowStock.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={24} className="text-success mb-2 opacity-60" />
              <div className="text-xs text-text-muted">All stock levels healthy</div>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStock.map(item => (
                <div
                  key={item.sku}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-elevated border border-border-subtle hover:border-border-default transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-mono-num text-xs font-semibold text-text-primary truncate">
                      {item.sku}
                    </div>
                    <div className="text-[10px] text-text-muted truncate mt-0.5">
                      {item.product_name}
                    </div>
                  </div>
                  <span className={cn('badge ml-3 shrink-0', stockBadgeClass(item.available_qty))}>
                    {item.available_qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Recent Sync Events ───────────────────────────────────────────────── */}
      <motion.div
        className="card overflow-hidden"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.34 }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">Recent sync events</span>
          </div>
          <Link
            href="/dashboard/logs"
            className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
          >
            View all
            <ArrowUpRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="py-16 text-center">
            <Clock size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
            <div className="text-sm text-text-muted">No sync events yet</div>
            <div className="text-xs text-text-muted mt-1 opacity-60">
              Events appear here once inventory syncs to channels
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Qty pushed</th>
                  <th>Trigger</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.36 + i * 0.03 }}
                  >
                    <td className="font-mono-num text-xs font-semibold text-text-primary">
                      {log.sku}
                    </td>
                    <td>
                      <span className="text-sm">{channelIcon(log.channel)}</span>
                      <span className="ml-1.5 text-xs text-text-secondary capitalize">
                        {log.channel}
                      </span>
                    </td>
                    <td>
                      <span className={cn('badge', statusBadgeClass(log.status))}>
                        {log.status === 'dead_letter' ? '💀 dead' : log.status}
                      </span>
                    </td>
                    <td className="font-mono-num text-sm font-medium">{log.qty_pushed}</td>
                    <td className="text-xs text-text-muted max-w-[160px] truncate">
                      {log.trigger_source}
                    </td>
                    <td className="text-xs text-text-muted whitespace-nowrap">
                      {formatRelative(log.created_at)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── System Info ──────────────────────────────────────────────────────── */}
      {health && (
        <motion.div
          className="card p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.44 }}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <Server size={12} />
              <span>API v{health.version}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('status-dot', health.database === 'ok' ? 'status-dot-success' : 'status-dot-danger')} />
              <span>Database {health.database === 'ok' ? 'connected' : 'error'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('status-dot', health.redis === 'ok' ? 'status-dot-success' : 'status-dot-danger')} />
              <span>Redis {health.redis === 'ok' ? 'connected' : 'error'}</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Zap size={12} className="text-accent" />
              <span className="text-accent">Desync-Zero</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
