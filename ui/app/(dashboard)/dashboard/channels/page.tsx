'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Eye, EyeOff, Save, Trash2, X } from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface Channel {
  id: 'takealot' | 'amazon' | 'shopify'
  name: string
  emoji: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[]
  docsUrl: string
}

const CHANNELS: Channel[] = [
  {
    id: 'takealot',
    name: 'Takealot',
    emoji: '🛒',
    description: "South Africa's largest online retailer. Paste your Seller API key from the Seller Portal.",
    color: 'text-[#0096DC]',
    bgColor: 'bg-[rgba(0,150,220,0.08)]',
    borderColor: 'border-[rgba(0,150,220,0.3)]',
    fields: [
      { key: 'api_key', label: 'Seller API Key', placeholder: 'tak_live_xxxxxxxxxxxx', secret: true },
    ],
    docsUrl: 'https://seller.takealot.com',
  },
  {
    id: 'amazon',
    name: 'Amazon SA',
    emoji: '📦',
    description: 'Amazon Selling Partner API. You need an SP-API access token, seller ID and marketplace ID.',
    color: 'text-[#FF9900]',
    bgColor: 'bg-[rgba(255,153,0,0.08)]',
    borderColor: 'border-[rgba(255,153,0,0.30)]',
    fields: [
      { key: 'access_token', label: 'SP-API Access Token', placeholder: 'Atza|xxx...', secret: true },
      { key: 'seller_id',    label: 'Seller ID',           placeholder: 'A1XXXXXXXXXXXX' },
      { key: 'marketplace_id', label: 'Marketplace ID',    placeholder: 'A1AM78C64UM0Y8' },
    ],
    docsUrl: 'https://sellercentral.amazon.com',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    emoji: '🏪',
    description: 'Connect your Shopify store to receive order webhooks. Add the webhook secret from your Shopify admin.',
    color: 'text-[#96BF48]',
    bgColor: 'bg-[rgba(150,191,72,0.08)]',
    borderColor: 'border-[rgba(150,191,72,0.30)]',
    fields: [
      { key: 'shop_domain',     label: 'Shop Domain',      placeholder: 'your-store.myshopify.com' },
      { key: 'webhook_secret',  label: 'Webhook Secret',   placeholder: 'shpss_xxxxxxxxxxxx', secret: true },
      { key: 'access_token',    label: 'Access Token',     placeholder: 'shpat_xxxxxxxxxxxx', secret: true },
    ],
    docsUrl: 'https://admin.shopify.com',
  },
]

function ChannelCard({ channel, connected, onRefresh }: {
  channel: Channel; connected: boolean; onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues]     = useState<Record<string, string>>({})
  const [show, setShow]         = useState<Record<string, boolean>>({})
  const [saving, setSaving]     = useState(false)
  const [removing, setRemoving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(values)) {
        if (value.trim()) await api.setCredential(channel.id, key, value.trim())
      }
      toast.success(`${channel.name} credentials saved`)
      setValues({})
      setExpanded(false)
      onRefresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Remove all ${channel.name} credentials? This will stop syncing to this channel.`)) return
    setRemoving(true)
    try {
      await api.deleteChannelCredentials(channel.id)
      toast.success(`${channel.name} disconnected`)
      onRefresh()
    } catch {
      toast.error('Failed to remove credentials')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <motion.div
      layout
      className={cn('card border overflow-hidden', channel.borderColor,
        connected ? channel.bgColor : '')}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-11 h-11 rounded-xl border flex items-center justify-center text-xl flex-shrink-0', channel.bgColor, channel.borderColor)}>
              {channel.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={cn('font-display font-bold text-sm', channel.color)}>{channel.name}</h3>
                {connected ? (
                  <span className="badge badge-success text-[10px]">
                    <span className="status-dot status-dot-success" /> Connected
                  </span>
                ) : (
                  <span className="badge badge-muted text-[10px]">
                    <span className="status-dot status-dot-muted" /> Not connected
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-0.5 max-w-sm">{channel.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {connected && (
              <button onClick={remove} disabled={removing}
                className="btn-ghost p-1.5 text-danger hover:bg-danger/10" title="Disconnect">
                <Trash2 size={14} className={removing ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={() => setExpanded(p => !p)} className="btn-secondary text-xs gap-1">
              {connected ? 'Update keys' : 'Connect'}
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* Shopify webhook URL */}
        {channel.id === 'shopify' && connected && (
          <div className="mt-4 p-3 rounded-lg bg-elevated border border-border-subtle">
            <p className="text-xs text-text-muted mb-1.5">Webhook URL to paste in Shopify Admin → Settings → Notifications:</p>
            <div className="font-mono-num text-xs text-accent bg-base rounded px-2.5 py-1.5 break-all">
              {typeof window !== 'undefined' ? `${window.location.origin.replace('3000', '8000')}/webhook/shopify/order-created` : 'http://your-api-domain/webhook/shopify/order-created'}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className={cn('border-t p-5 space-y-4', channel.borderColor)}>
              {channel.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      type={field.secret && !show[field.key] ? 'password' : 'text'}
                      className="input-base font-mono-num text-sm pr-10"
                      placeholder={connected ? '••••••••••••••••' : field.placeholder}
                      value={values[field.key] ?? ''}
                      onChange={e => setValues(p => ({ ...p, [field.key]: e.target.value }))}
                    />
                    {field.secret && (
                      <button type="button"
                        onClick={() => setShow(p => ({ ...p, [field.key]: !p[field.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                        {show[field.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setExpanded(false); setValues({}) }}
                  className="btn-ghost text-xs flex-1 justify-center">Cancel</button>
                <button onClick={save} disabled={saving || Object.values(values).every(v => !v.trim())}
                  className="btn-primary text-xs flex-1 justify-center">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" />
                    : <><Save size={13} /> Save credentials</>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function ChannelsPage() {
  const [connected, setConnected] = useState<string[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConnected(await api.getConfiguredChannels())
    } catch {
      toast.error('Failed to load channel status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const connectedCount = connected.length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary mt-0.5">
            Credentials are encrypted at rest — never stored in plain text
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {loading ? (
            <div className="w-4 h-4 border-2 border-border-default border-t-accent rounded-full animate-spin" />
          ) : (
            <>
              <span className="status-dot status-dot-success" />
              {connectedCount} / {CHANNELS.length} channels connected
            </>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        {CHANNELS.map(ch => (
          <div key={ch.id} className={cn('card border p-4 flex items-center gap-3',
            connected.includes(ch.id) ? ch.borderColor : 'border-border-subtle')}>
            <span className="text-2xl">{ch.emoji}</span>
            <div>
              <div className={cn('text-sm font-semibold font-display', connected.includes(ch.id) ? ch.color : 'text-text-secondary')}>
                {ch.name}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                {connected.includes(ch.id) ? '✓ Credentials saved' : 'Not connected'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Channel cards */}
      <div className="space-y-4">
        {CHANNELS.map(ch => (
          <ChannelCard
            key={ch.id}
            channel={ch}
            connected={connected.includes(ch.id)}
            onRefresh={load}
          />
        ))}
      </div>

      {/* Info box */}
      <div className="card border border-border-subtle p-4 flex gap-3 text-xs text-text-secondary">
        <div className="w-5 h-5 rounded bg-accent-dim border border-border-bright flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-accent text-[10px] font-bold">i</span>
        </div>
        <div>
          <span className="text-text-primary font-medium">How it works: </span>
          Credentials are encrypted using AES-256 before storage. When a Shopify order fires a webhook,
          Desync-Zero reads your marketplace keys on-the-fly and pushes the updated stock quantity.
          Keys are never logged or exposed in API responses.
        </div>
      </div>
    </div>
  )
}
