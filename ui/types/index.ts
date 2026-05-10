export interface User {
  user_id: string
  tenant_id: string
  email: string
  plan: Plan
}

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise'

export interface Tenant {
  id: string
  name: string
  email: string
  plan: Plan
  is_active: boolean
  created_at: string
  subscription_status: string | null
  current_period_end: string | null
}

export interface InventoryItem {
  sku: string
  product_name: string
  total_qty: number
  safety_buffer: number
  available_qty: number
  last_updated: string
  version: number
}

export interface ChannelMapping {
  id: string
  universal_sku: string
  channel: 'takealot' | 'amazon' | 'shopify'
  channel_sku_id: string
  channel_product_id: string | null
  is_active: boolean
  created_at: string
}

export interface SyncLog {
  id: string
  sku: string
  channel: string
  trigger_source: string
  qty_before: number
  qty_after: number
  qty_pushed: number
  status: 'pending' | 'success' | 'failed' | 'retrying' | 'dead_letter'
  http_status_code: number | null
  error_message: string | null
  retry_count: number
  latency_ms: number | null
  created_at: string
  resolved_at: string | null
}

export interface SyncLogsResponse {
  total: number
  items: SyncLog[]
}

export interface UsageStat {
  used: number
  limit: number | 'unlimited'
  percent: number
}

export interface UsageSummary {
  orders_this_month: UsageStat
  active_skus: UsageStat
  active_channels: UsageStat
}

export interface ApiKey {
  id: string
  name: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
}

export interface PlanDetails {
  display_name: string
  price_zar_cents: number
  orders_per_month: number
  skus: number
  channels: number
}

export interface HealthStatus {
  status: 'healthy' | 'degraded'
  database: string
  redis: string
  version: string
  timestamp: string
}
