import './globals.css'
import type { Metadata } from 'next'
import { ThemeProvider } from './theme-provider'

export const metadata: Metadata = {
  title: 'Kelo Moderation',
  description: 'Console privée de modération Kelo Social',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr" data-theme="dark"><body><ThemeProvider>{children}</ThemeProvider></body></html>
}
