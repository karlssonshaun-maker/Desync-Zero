import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Desync-Zero — Stock Orchestration',
  description: 'Real-time inventory sync across Takealot, Amazon SA and Shopify',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-base text-text-primary antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#0d1425',
                color: '#e8f0fe',
                border: '1px solid rgba(48,88,160,0.35)',
                borderRadius: '10px',
                fontSize: '13px',
              },
              success: { iconTheme: { primary: '#00e676', secondary: '#0d1425' } },
              error:   { iconTheme: { primary: '#ff4d4d', secondary: '#0d1425' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
