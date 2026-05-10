'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key, CreditCard, Copy, Check, Plus, Trash2, X,
  Zap, Shield, TrendingUp, Crown, ExternalLink,
} from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import toast from 'react-hot-toast'
import { cn, formatDate, formatZAR, planBadgeClass } from '@/lib/utils'
import type { ApiKey, PlanDetails, Tenant } from '@/types'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="btn-ghost p-1.5" title="Copy">
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </button>
  )
}

function NewKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [name, setName]     = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.createApiKey(name)
      onCreated(res.api_key)
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative card border border-border-default w-full max-w-sm p-6 z-10"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-bold text-base text-text-primary">New API Key</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Key name</label>
            <input required className="input-base" placeholder="e.g. Shopify webhook integration"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <p className="text-xs text-text-muted">
            The raw key is shown once after creation. Store it securely — it cannot be retrieved again.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" /> : 'Generate'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function NewKeyReveal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base/80 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="relative card border border-success/40 bg-success-dim w-full max-w-md p-6 z-10"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-success/10 border border-success/30 flex items-center justify-center">
            <Key size={16} className="text-success" />
          </div>
          <div>
            <h2 className="font-display font-bold text-sm text-text-primary">API Key Created</h2>
            <p className="text-xs text-success mt-0.5">Copy it now — it won&apos;t be shown again</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-base rounded-lg p-3 border border-border-subtle mb-5">
          <code className="font-mono-num text-xs text-accent flex-1 break-all">{rawKey}</code>
          <CopyButton text={rawKey} />
        </div>
        <button onClick={onClose} className="btn-primary w-full justify-center">
          I&apos;ve saved it
        </button>
      </motion.div>
    </div>
  )
}

const PLAN_ICONS = {
  free: Zap, starter: Shield, pro: TrendingUp, enterprise: Crown,
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [tenant,    setTenant]    = useState<Tenant | null>(null)
  const [apiKeys,   setApiKeys]   = useState<ApiKey[]>([])
  const [plans,     setPlans]     = useState<Record<string, PlanDetails>>({})
  const [loading,   setLoading]   = useState(true)
  const [showNew,   setShowNew]   = useState(false)
  const [revealKey, setRevealKey] = useState<string | null>(null)
  const [revoking,  setRevoking]  = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, k, p] = await Promise.all([api.getTenant(), api.listApiKeys(), api.getPlans()])
      setTenant(t); setApiKeys(k); setPlans(p)
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const revoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? Any integrations using it will stop working immediately.')) return
    setRevoking(keyId)
    try {
      await api.revokeApiKey(keyId)
      toast.success('API key revoked')
      setApiKeys(keys => keys.filter(k => k.id !== keyId))
    } catch {
      toast.error('Failed to revoke key')
    } finally {
      setRevoking(null)
    }
  }

  const upgrade = async (plan: string) => {
    setUpgrading(plan)
    try {
      const url = await api.createCheckout(
        plan,
        window.location.origin + '/dashboard/settings?upgraded=1',
        window.location.origin + '/dashboard/settings',
      )
      window.location.href = url
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Billing not configured')
    } finally {
      setUpgrading(null)
    }
  }

  const currentPlan = user?.plan ?? 'free'

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <AnimatePresence>
        {showNew && (
          <NewKeyModal
            onClose={() => setShowNew(false)}
            onCreated={(key) => { setRevealKey(key); load() }}
          />
        )}
        {revealKey && (
          <NewKeyReveal rawKey={revealKey} onClose={() => setRevealKey(null)} />
        )}
      </AnimatePresence>

      {/* Account */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h2 className="font-display font-bold text-sm text-text-secondary uppercase tracking-wider mb-4">Account</h2>
        <div className="card p-5 space-y-4">
          {loading || !tenant ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-6 rounded w-2/3" />)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-text-muted mb-1">Business name</div>
                <div className="text-text-primary font-medium">{tenant.name}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-1">Email</div>
                <div className="text-text-primary font-medium">{tenant.email}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-1">Current plan</div>
                <span className={cn('badge', planBadgeClass(tenant.plan))}>{tenant.plan}</span>
              </div>
              <div>
                <div className="text-xs text-text-muted mb-1">Member since</div>
                <div className="text-text-secondary text-xs">{formatDate(tenant.created_at)}</div>
              </div>
              {tenant.current_period_end && (
                <div>
                  <div className="text-xs text-text-muted mb-1">Billing period ends</div>
                  <div className="text-text-secondary text-xs">{formatDate(tenant.current_period_end)}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-text-muted mb-1">Subscription status</div>
                <span className={cn('badge text-[10px]',
                  tenant.subscription_status === 'active' ? 'badge-success' : 'badge-muted')}>
                  {tenant.subscription_status ?? 'free'}
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {/* API Keys */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-sm text-text-secondary uppercase tracking-wider">API Keys</h2>
          <button onClick={() => setShowNew(true)} className="btn-primary text-xs">
            <Plus size={13} /> New key
          </button>
        </div>
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-3">{[1,2].map(i => <div key={i} className="skeleton h-12 rounded" />)}</div>
          ) : apiKeys.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              <Key size={24} className="mx-auto mb-2 opacity-30" />
              No API keys — create one to authenticate webhook calls
            </div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key, i) => (
                  <motion.tr key={key.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <td className="text-sm text-text-primary font-medium">{key.name}</td>
                    <td>
                      <span className={cn('badge text-[10px]', key.is_active ? 'badge-success' : 'badge-muted')}>
                        {key.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="text-xs text-text-muted">{formatDate(key.created_at)}</td>
                    <td className="text-xs text-text-muted">
                      {key.last_used_at ? formatDate(key.last_used_at) : 'Never'}
                    </td>
                    <td>
                      {key.is_active && (
                        <button onClick={() => revoke(key.id)} disabled={revoking === key.id}
                          className="btn-ghost p-1.5 text-danger hover:bg-danger/10">
                          <Trash2 size={13} className={revoking === key.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-text-muted mt-3 px-1">
          Use the <code className="font-mono-num text-accent bg-accent-dim px-1.5 py-0.5 rounded">X-API-Key</code> header
          to authenticate inventory and webhook endpoints.
        </p>
      </motion.section>

      {/* Billing */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h2 className="font-display font-bold text-sm text-text-secondary uppercase tracking-wider mb-4">
          Plans & Billing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Object.entries(plans).map(([planId, plan]) => {
            const Icon = PLAN_ICONS[planId as keyof typeof PLAN_ICONS] ?? Zap
            const isCurrent = currentPlan === planId
            const isFree = planId === 'free'

            return (
              <motion.div key={planId}
                whileHover={{ y: -2 }}
                className={cn(
                  'card border p-5 flex flex-col gap-4 relative overflow-hidden',
                  isCurrent ? 'border-accent/40 bg-accent-dim' : 'border-border-subtle card-hover',
                  planId === 'pro' ? 'border-purple/40' : '',
                )}
              >
                {planId === 'pro' && (
                  <div className="absolute top-0 right-0">
                    <div className="text-[10px] font-bold bg-purple text-base px-3 py-0.5 rounded-bl-lg">
                      POPULAR
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center border',
                    planId === 'free'       ? 'bg-border/20 border-border-default' :
                    planId === 'starter'    ? 'bg-accent-dim border-border-bright' :
                    planId === 'pro'        ? 'bg-purple-dim border-purple/30' :
                    'bg-warning-dim border-warning/30'
                  )}>
                    <Icon size={14} className={
                      planId === 'free'       ? 'text-text-muted' :
                      planId === 'starter'    ? 'text-accent' :
                      planId === 'pro'        ? 'text-purple' :
                      'text-warning'
                    } />
                  </div>
                  <div>
                    <div className="font-display font-bold text-sm text-text-primary">{plan.display_name}</div>
                    <div className="font-mono-num text-xs text-text-secondary">
                      {plan.price_zar_cents === 0 ? 'Free' : `${formatZAR(plan.price_zar_cents)}/mo`}
                    </div>
                  </div>
                </div>

                <ul className="space-y-2 flex-1">
                  {[
                    [`${plan.orders_per_month === -1 ? 'Unlimited' : plan.orders_per_month} orders/mo`],
                    [`${plan.skus === -1 ? 'Unlimited' : plan.skus} SKUs`],
                    [`${plan.channels === -1 ? 'All' : plan.channels} channel${plan.channels === 1 ? '' : 's'}`],
                  ].map(([text], j) => (
                    <li key={j} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="text-success">✓</span> {text}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="badge badge-info text-[10px] justify-center">Current plan</div>
                ) : !isFree ? (
                  <button
                    onClick={() => upgrade(planId)}
                    disabled={upgrading === planId}
                    className={cn('btn-primary text-xs justify-center',
                      planId === 'pro' ? 'bg-gradient-to-r from-purple to-[#7c4dff]' : '',
                      planId === 'enterprise' ? 'bg-gradient-to-r from-warning to-[#ff6d00]' : '',
                    )}
                  >
                    {upgrading === planId
                      ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" />
                      : <><ExternalLink size={12} /> Upgrade</>
                    }
                  </button>
                ) : null}
              </motion.div>
            )
          })}
        </div>
      </motion.section>

      {/* Webhook URL reference */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="font-display font-bold text-sm text-text-secondary uppercase tracking-wider mb-4">Webhook URLs</h2>
        <div className="card p-5 space-y-3">
          <p className="text-xs text-text-secondary">
            Register these URLs in your platforms to push events to Desync-Zero.
            Always send your API key in the <code className="font-mono-num text-accent">X-API-Key</code> header.
          </p>
          {[
            { label: 'Shopify — Order Created', path: '/webhook/shopify/order-created' },
          ].map(({ label, path }) => (
            <div key={path}>
              <div className="text-xs text-text-muted mb-1.5">{label}</div>
              <div className="flex items-center gap-2 bg-base rounded-lg px-3 py-2 border border-border-subtle">
                <code className="font-mono-num text-xs text-accent flex-1 break-all">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin.replace(':3000', ':8000')}${path}`
                    : `http://your-api-domain${path}`}
                </code>
                <CopyButton text={`http://your-api-domain${path}`} />
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  )
}
