'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import api from '@/lib/api'
import toast from 'react-hot-toast'

const NODE_POSITIONS = [
  { x: 18, y: 22 }, { x: 72, y: 15 }, { x: 45, y: 50 },
  { x: 85, y: 42 }, { x: 25, y: 68 }, { x: 60, y: 78 },
  { x: 10, y: 85 }, { x: 90, y: 80 }, { x: 50, y: 25 },
]

const EDGES = [
  [0,2],[1,2],[2,3],[2,4],[3,5],[4,6],[5,7],[2,8],[8,1]
]

export default function LoginPage() {
  const { login } = useAuth()
  const [tab, setTab]             = useState<'login' | 'register'>('login')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm,   setRegForm]   = useState({
    tenantName: '', email: '', password: '', fullName: '',
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(loginForm.email, loginForm.password)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8)           return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pw))       return 'Password must contain at least one uppercase letter'
    if (!/[0-9]/.test(pw))       return 'Password must contain at least one number'
    return null
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const pwError = validatePassword(regForm.password)
    if (pwError) { toast.error(pwError); return }
    setLoading(true)
    try {
      await api.register(regForm.tenantName, regForm.email, regForm.password, regForm.fullName)
      toast.success('Account created — please sign in')
      setTab('login')
      setLoginForm({ email: regForm.email, password: '' })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-base overflow-hidden">
      {/* ── Left panel — network visualization ── */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative bg-dot-grid overflow-hidden p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-base via-base to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-base/80 to-transparent" />

        {/* Animated network */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-2/3 h-2/3 opacity-60">
            {EDGES.map(([a, b], i) => (
              <motion.line
                key={i}
                x1={NODE_POSITIONS[a].x} y1={NODE_POSITIONS[a].y}
                x2={NODE_POSITIONS[b].x} y2={NODE_POSITIONS[b].y}
                stroke="rgba(0,212,255,0.25)" strokeWidth="0.4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: i * 0.12, duration: 0.8 }}
              />
            ))}
            {NODE_POSITIONS.map((pos, i) => (
              <motion.g key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
                style={{ transformOrigin: `${pos.x}% ${pos.y}%` }}
              >
                <circle cx={pos.x} cy={pos.y} r="1.5"
                  fill="rgba(0,212,255,0.15)" stroke="#00d4ff" strokeWidth="0.4" />
                <motion.circle cx={pos.x} cy={pos.y} r="2.5"
                  fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="0.3"
                  animate={{ r: [2.5, 4, 2.5], opacity: [0.2, 0, 0.2] }}
                  transition={{ delay: i * 0.3, duration: 3, repeat: Infinity }}
                />
              </motion.g>
            ))}
            {EDGES.map(([a, b], i) => {
              const mx = (NODE_POSITIONS[a].x + NODE_POSITIONS[b].x) / 2
              const my = (NODE_POSITIONS[a].y + NODE_POSITIONS[b].y) / 2
              return (
                <motion.circle key={`pulse-${i}`} cx={mx} cy={my} r="0.6"
                  fill="#00d4ff"
                  animate={{
                    cx: [NODE_POSITIONS[a].x, NODE_POSITIONS[b].x, NODE_POSITIONS[a].x],
                    cy: [NODE_POSITIONS[a].y, NODE_POSITIONS[b].y, NODE_POSITIONS[a].y],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    delay: i * 0.5 + 1,
                    duration: 2.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              )
            })}
          </svg>
        </div>

        {/* Brand */}
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-accent-dim border border-border-bright flex items-center justify-center glow-accent">
              <Zap size={18} className="text-accent" />
            </div>
            <span className="font-display font-bold text-xl text-text-primary tracking-tight">
              DESYNC<span className="text-accent">-ZERO</span>
            </span>
          </motion.div>
        </div>

        {/* Feature bullets */}
        <div className="relative z-10 space-y-5">
          {[
            { icon: Zap,       title: 'Real-time sync',         desc: 'Orders push to Takealot & Amazon in under 2 seconds' },
            { icon: Shield,    title: 'No OOS fines',           desc: 'Safety buffers prevent overselling before it happens' },
            { icon: BarChart3, title: 'Full audit trail',        desc: 'Every stock movement logged with latency & status' },
          ].map(({ icon: Icon, title, desc }, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.15, duration: 0.5 }}
              className="flex items-start gap-4"
            >
              <div className="w-8 h-8 rounded-lg bg-accent-dim border border-border-bright flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon size={15} className="text-accent" />
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary font-display">{title}</div>
                <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">{desc}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="relative z-10"
        >
          <span className="badge badge-info text-xs">
            <span className="status-dot status-dot-success" />
            Built for South African sellers
          </span>
        </motion.div>
      </div>

      {/* ── Right panel — auth form ── */}
      <div className="w-full lg:w-[480px] flex flex-col justify-center px-8 py-12 relative">
        <div className="absolute inset-0 bg-surface/60 lg:border-l border-border-subtle" />

        <div className="relative z-10 w-full max-w-[380px] mx-auto">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-accent-dim border border-border-bright flex items-center justify-center">
              <Zap size={16} className="text-accent" />
            </div>
            <span className="font-display font-bold text-lg text-text-primary">
              DESYNC<span className="text-accent">-ZERO</span>
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-display text-2xl font-bold text-text-primary mb-1">
              {tab === 'login' ? 'Welcome back' : 'Get started'}
            </h1>
            <p className="text-sm text-text-secondary mb-8">
              {tab === 'login'
                ? 'Sign in to your inventory dashboard'
                : 'Create your account — free plan, no card required'}
            </p>

            {/* Tab toggle */}
            <div className="flex gap-1 p-1 rounded-lg bg-elevated border border-border-subtle mb-8">
              {(['login', 'register'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    tab === t
                      ? 'bg-accent-dim text-accent border border-border-bright shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === 'login' ? (
                <motion.form key="login"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email" required
                      className="input-base"
                      placeholder="you@company.co.za"
                      value={loginForm.email}
                      onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'} required
                        className="input-base pr-10"
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                      />
                      <button type="button" onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-6">
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" />
                    ) : (
                      <>Sign in <ArrowRight size={16} /></>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form key="register"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleRegister}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Business name
                    </label>
                    <input
                      type="text" required
                      className="input-base"
                      placeholder="Acme Retail (Pty) Ltd"
                      value={regForm.tenantName}
                      onChange={e => setRegForm(p => ({ ...p, tenantName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Your name
                    </label>
                    <input
                      type="text"
                      className="input-base"
                      placeholder="Shaun"
                      value={regForm.fullName}
                      onChange={e => setRegForm(p => ({ ...p, fullName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email" required
                      className="input-base"
                      placeholder="you@company.co.za"
                      value={regForm.email}
                      onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'} required minLength={8}
                        className="input-base pr-10"
                        placeholder="Min. 8 characters"
                        value={regForm.password}
                        onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))}
                      />
                      <button type="button" onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {regForm.password && (
                      <div className="flex gap-3 mt-2">
                        {[
                          { ok: regForm.password.length >= 8,      label: '8+ chars' },
                          { ok: /[A-Z]/.test(regForm.password),    label: 'Uppercase' },
                          { ok: /[0-9]/.test(regForm.password),    label: 'Number' },
                        ].map(({ ok, label }) => (
                          <span key={label} className={`text-[10px] flex items-center gap-1 ${ok ? 'text-success' : 'text-text-muted'}`}>
                            <span>{ok ? '✓' : '·'}</span>{label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-6">
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-base/30 border-t-base rounded-full animate-spin" />
                    ) : (
                      <>Create account <ArrowRight size={16} /></>
                    )}
                  </button>
                  <p className="text-xs text-text-muted text-center mt-3">
                    Free plan includes 100 orders/month · No credit card needed
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
