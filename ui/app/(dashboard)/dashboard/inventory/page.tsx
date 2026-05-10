'use client'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, ChevronUp, ChevronDown,
  Package, Edit2, Zap, X, AlertTriangle, Link2
} from 'lucide-react'
import api from '@/lib/api'
import toast from 'react-hot-toast'
import { cn, stockBadgeClass, formatRelative, channelIcon } from '@/lib/utils'
import type { InventoryItem } from '@/types'

function AddSkuModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    sku: '', product_name: '', total_qty: 0, safety_buffer: 0,
  })
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.createInventory(form)
      toast.success(`SKU ${form.sku} created`)
      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create SKU')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative card border border-border-default w-full max-w-md p-6 z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-base text-text-primary">Add SKU</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">SKU *</label>
            <input required className="input-base font-mono-num" placeholder="PROD-001"
              value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Product Name *</label>
            <input required className="input-base" placeholder="Widget Pro 500ml"
              value={form.product_name} onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Stock Qty</label>
              <input type="number" min={0} required className="input-base font-mono-num"
                value={form.total_qty} onChange={e => setForm(p => ({ ...p, total_qty: +e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Safety Buffer</label>
              <input type="number" min={0} required className="input-base font-mono-num"
                value={form.safety_buffer} onChange={e => setForm(p => ({ ...p, safety_buffer: +e.target.value }))} />
            </div>
          </div>
          <div className="p-3 rounded-lg bg-accent-dim border border-border-bright text-xs text-text-secondary">
            <span className="text-accent font-medium">Available to marketplaces: </span>
            {Math.max(form.total_qty - form.safety_buffer, 0)} units
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" /> : 'Create SKU'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function EditQtyModal({ item, onClose, onUpdated }: { item: InventoryItem; onClose: () => void; onUpdated: () => void }) {
  const [qty, setQty] = useState(item.total_qty)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.updateInventory(item.sku, qty)
      toast.success(`${item.sku} updated — syncing channels`)
      onUpdated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-base/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative card border border-border-default w-full max-w-sm p-6 z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display font-bold text-base text-text-primary">Update Stock</h2>
            <p className="text-xs text-text-muted font-mono-num mt-0.5">{item.sku}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">New Total Qty</label>
            <input type="number" min={0} required className="input-base font-mono-num text-lg"
              value={qty} onChange={e => setQty(+e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-elevated border border-border-subtle text-center">
              <div className="text-text-muted">Safety buffer</div>
              <div className="font-mono-num font-bold text-text-primary mt-0.5">{item.safety_buffer}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-accent-dim border border-border-bright text-center">
              <div className="text-text-muted">Will push</div>
              <div className="font-mono-num font-bold text-accent mt-0.5">
                {Math.max(qty - item.safety_buffer, 0)}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" /> : 'Update & Sync'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function AddMappingModal({ sku, onClose, onCreated }: { sku: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ channel: 'takealot', channel_sku_id: '', channel_product_id: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.createChannelMapping({ universal_sku: sku, ...form })
      toast.success(`Mapped ${sku} to ${form.channel}`)
      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Mapping failed')
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display font-bold text-base text-text-primary">Link Channel</h2>
            <p className="text-xs text-text-muted font-mono-num mt-0.5">{sku}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Channel</label>
            <select className="input-base" value={form.channel}
              onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}>
              <option value="takealot">🛒 Takealot</option>
              <option value="amazon">📦 Amazon SA</option>
              <option value="shopify">🏪 Shopify</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
              {form.channel === 'takealot' ? 'TSIN' : form.channel === 'amazon' ? 'ASIN / Seller SKU' : 'Variant ID'}
            </label>
            <input required className="input-base font-mono-num"
              placeholder={form.channel === 'takealot' ? 'TSIN12345678' : form.channel === 'amazon' ? 'B0XXXXXXXX' : '44309...'}
              value={form.channel_sku_id}
              onChange={e => setForm(p => ({ ...p, channel_sku_id: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" /> : 'Link'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

export default function InventoryPage() {
  const [items, setItems]         = useState<InventoryItem[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [editItem, setEditItem]   = useState<InventoryItem | null>(null)
  const [mapSku, setMapSku]       = useState<string | null>(null)
  const [syncing, setSyncing]     = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof InventoryItem>('last_updated')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.listInventory()) }
    catch { toast.error('Failed to load inventory') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const forceSync = async (sku: string) => {
    setSyncing(sku)
    try {
      await api.forceSync(sku)
      toast.success(`${sku} synced to all channels`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  const toggleSort = (field: keyof InventoryItem) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: keyof InventoryItem }) => {
    if (sortField !== field) return <ChevronUp size={11} className="opacity-20" />
    return sortDir === 'asc' ? <ChevronUp size={11} className="text-accent" /> : <ChevronDown size={11} className="text-accent" />
  }

  const filtered = items
    .filter(i =>
      i.sku.toLowerCase().includes(search.toLowerCase()) ||
      i.product_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortField] as string | number
      const bv = b[sortField] as string | number
      return sortDir === 'asc'
        ? (av < bv ? -1 : av > bv ? 1 : 0)
        : (av > bv ? -1 : av < bv ? 1 : 0)
    })

  return (
    <div className="p-6 space-y-5">
      <AnimatePresence>
        {showAdd && <AddSkuModal onClose={() => setShowAdd(false)} onCreated={load} />}
        {editItem && <EditQtyModal item={editItem} onClose={() => setEditItem(null)} onUpdated={load} />}
        {mapSku && <AddMappingModal sku={mapSku} onClose={() => setMapSku(null)} onCreated={load} />}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="input-base pl-9 text-sm" placeholder="Search SKU or product name…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={load} className="btn-ghost text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
          <Plus size={14} /> Add SKU
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-xs text-text-muted">
        <span><span className="font-mono-num text-text-primary font-bold">{items.length}</span> SKUs total</span>
        <span><span className="font-mono-num text-warning font-bold">{items.filter(i => i.available_qty <= 5).length}</span> low stock</span>
        <span><span className="font-mono-num text-danger font-bold">{items.filter(i => i.available_qty === 0).length}</span> out of stock</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Package size={32} className="mx-auto mb-3 text-text-muted opacity-40" />
            <div className="text-sm text-text-muted">
              {search ? 'No SKUs match your search' : 'No SKUs yet — click Add SKU to get started'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {([
                    ['sku', 'SKU'],
                    ['product_name', 'Product'],
                    ['total_qty', 'Total'],
                    ['safety_buffer', 'Buffer'],
                    ['available_qty', 'Available'],
                    ['last_updated', 'Updated'],
                  ] as [keyof InventoryItem, string][]).map(([field, label]) => (
                    <th key={field}>
                      <button className="flex items-center gap-1 hover:text-text-secondary transition-colors"
                        onClick={() => toggleSort(field)}>
                        {label} <SortIcon field={field} />
                      </button>
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <motion.tr key={item.sku}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <td className="font-mono-num text-xs font-semibold text-text-primary">{item.sku}</td>
                    <td className="text-sm text-text-primary max-w-[200px] truncate">{item.product_name}</td>
                    <td className="font-mono-num text-sm font-medium">{item.total_qty}</td>
                    <td className="font-mono-num text-xs text-text-muted">{item.safety_buffer}</td>
                    <td>
                      <span className={cn('badge font-mono-num', stockBadgeClass(item.available_qty))}>
                        {item.available_qty}
                      </span>
                      {item.available_qty === 0 && (
                        <AlertTriangle size={12} className="inline ml-1.5 text-danger" />
                      )}
                    </td>
                    <td className="text-xs text-text-muted whitespace-nowrap">{formatRelative(item.last_updated)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditItem(item)} className="btn-ghost p-1.5" title="Edit stock">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => setMapSku(item.sku)} className="btn-ghost p-1.5" title="Add channel mapping">
                          <Link2 size={13} />
                        </button>
                        <button onClick={() => forceSync(item.sku)} disabled={syncing === item.sku}
                          className="btn-ghost p-1.5 text-accent" title="Force sync">
                          <Zap size={13} className={syncing === item.sku ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
