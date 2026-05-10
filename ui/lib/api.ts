import axios, { AxiosInstance, AxiosError } from 'axios'
import type {
  User, Tenant, InventoryItem, SyncLog, SyncLogsResponse,
  UsageSummary, ApiKey, PlanDetails, HealthStatus, ChannelMapping
} from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class ApiClient {
  private http: AxiosInstance

  constructor() {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 15000 })

    this.http.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('dz_token')
        if (token) config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    this.http.interceptors.response.use(
      (r) => r,
      (err: AxiosError) => {
        if (err.response?.status === 401 && typeof window !== 'undefined') {
          if (!window.location.pathname.includes('/login')) {
            localStorage.removeItem('dz_token')
            localStorage.removeItem('dz_user')
            window.location.href = '/login'
          }
        }
        return Promise.reject(err)
      }
    )
  }

  private errMsg(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const detail = (err.response?.data as { detail?: string })?.detail
      return detail || err.message
    }
    return 'An unexpected error occurred'
  }

  async health(): Promise<HealthStatus> {
    const { data } = await this.http.get('/health')
    return data
  }

  async register(tenantName: string, email: string, password: string, fullName?: string) {
    try {
      const { data } = await this.http.post('/auth/register', {
        tenant_name: tenantName,
        email,
        password,
        full_name: fullName,
      })
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async login(email: string, password: string): Promise<{ access_token: string; tenant_id: string; plan: string }> {
    try {
      const form = new FormData()
      form.append('username', email)
      form.append('password', password)
      const { data } = await this.http.post('/auth/login', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async me(): Promise<User> {
    const { data } = await this.http.get('/auth/me')
    return data
  }

  async getTenant(): Promise<Tenant> {
    const { data } = await this.http.get('/tenant/me')
    return data
  }

  async getUsage(): Promise<UsageSummary> {
    const { data } = await this.http.get('/tenant/usage')
    return data
  }

  async setCredential(channel: string, credentialKey: string, value: string) {
    try {
      const { data } = await this.http.post('/tenant/credentials', {
        channel, credential_key: credentialKey, value,
      })
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async getConfiguredChannels(): Promise<string[]> {
    const { data } = await this.http.get('/tenant/credentials/channels')
    return data.configured_channels
  }

  async deleteChannelCredentials(channel: string) {
    await this.http.delete(`/tenant/credentials/${channel}`)
  }

  async createApiKey(name: string): Promise<{ api_key: string }> {
    try {
      const { data } = await this.http.post('/tenant/api-keys', { name })
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const { data } = await this.http.get('/tenant/api-keys')
    return data
  }

  async revokeApiKey(keyId: string) {
    await this.http.delete(`/tenant/api-keys/${keyId}`)
  }

  async getPlans(): Promise<Record<string, PlanDetails>> {
    const { data } = await this.http.get('/billing/plans')
    return data
  }

  async createCheckout(plan: string, successUrl: string, cancelUrl: string): Promise<string> {
    try {
      const { data } = await this.http.post('/billing/checkout', {
        plan, success_url: successUrl, cancel_url: cancelUrl,
      })
      return data.checkout_url
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async listInventory(): Promise<InventoryItem[]> {
    const { data } = await this.http.get('/inventory/')
    return data
  }

  async getInventory(sku: string): Promise<InventoryItem> {
    const { data } = await this.http.get(`/inventory/${sku}`)
    return data
  }

  async createInventory(payload: {
    sku: string; product_name: string; total_qty: number; safety_buffer: number
  }): Promise<InventoryItem> {
    try {
      const { data } = await this.http.post('/inventory/', payload)
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async updateInventory(sku: string, newTotalQty: number): Promise<InventoryItem> {
    try {
      const { data } = await this.http.patch(`/inventory/${sku}`, {
        sku, new_total_qty: newTotalQty, trigger_source: 'dashboard_update',
      })
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async forceSync(sku: string) {
    try {
      const { data } = await this.http.post(`/inventory/${sku}/sync`)
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async createChannelMapping(payload: {
    universal_sku: string; channel: string; channel_sku_id: string; channel_product_id?: string
  }): Promise<ChannelMapping> {
    try {
      const { data } = await this.http.post('/inventory/mappings/', payload)
      return data
    } catch (err) { throw new Error(this.errMsg(err)) }
  }

  async getSyncLogs(params?: {
    limit?: number; offset?: number; status_filter?: string; channel_filter?: string
  }): Promise<SyncLogsResponse> {
    const { data } = await this.http.get('/inventory/logs', { params })
    return data
  }
}

const api = new ApiClient()
export default api
