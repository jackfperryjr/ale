import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ALE — The Brewery',
  description: 'Brewmaster dashboard for the Authenticity Logic Engine',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-serif">{children}</body>
    </html>
  )
}
