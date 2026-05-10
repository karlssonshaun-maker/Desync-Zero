import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#04070d',
        surface: '#080d18',
        elevated: '#0d1425',
        card: '#0a1020',
        accent: {
          DEFAULT: '#00d4ff',
          dim: 'rgba(0,212,255,0.10)',
          glow: 'rgba(0,212,255,0.25)',
        },
        success: {
          DEFAULT: '#00e676',
          dim: 'rgba(0,230,118,0.10)',
        },
        warning: {
          DEFAULT: '#ffab40',
          dim: 'rgba(255,171,64,0.10)',
        },
        danger: {
          DEFAULT: '#ff4d4d',
          dim: 'rgba(255,77,77,0.10)',
        },
        purple: {
          DEFAULT: '#bb86fc',
          dim: 'rgba(187,134,252,0.10)',
        },
        border: {
          subtle: 'rgba(48,88,160,0.18)',
          default: 'rgba(48,88,160,0.35)',
          bright: 'rgba(0,212,255,0.30)',
        },
        text: {
          primary: '#e8f0fe',
          secondary: '#7b91b8',
          muted: '#3d5070',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(0,212,255,0.15)',
        'glow-md': '0 0 24px rgba(0,212,255,0.20)',
        'glow-lg': '0 0 48px rgba(0,212,255,0.15)',
        'glow-success': '0 0 16px rgba(0,230,118,0.20)',
        'glow-danger': '0 0 16px rgba(255,77,77,0.20)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(48,88,160,0.18)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.20)',
      },
      backgroundImage: {
        'dot-grid': "radial-gradient(rgba(48,88,160,0.25) 1px, transparent 1px)",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      backgroundSize: {
        'dot-grid': '28px 28px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'scan': 'scan 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        scan: {
          '0%, 100%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(0,212,255,0.3)' },
          '50%': { boxShadow: '0 0 24px rgba(0,212,255,0.6)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
