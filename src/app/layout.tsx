import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'You Are Here — A Journey Through the Universe',
  description:
    'An interactive journey from Earth to the edge of the observable universe.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}