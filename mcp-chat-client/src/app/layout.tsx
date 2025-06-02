import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MCP Chat Client',
  description: 'A local chat client using Model Context Protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}