import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
import './globals.css'

/* Self-hosted at build time: no render-blocking request to Google Fonts */
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const TITLE = 'You Are Here — A Journey Through the Universe'
const DESCRIPTION =
  'An interactive 3D journey from the Sun, past all eight planets, out to our place in the Milky Way.'

/* where the site lives, so shared links carry a full address for their
   preview image: set NEXT_PUBLIC_SITE_URL, or Vercel's own is used */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

/* the preview image itself is app/opengraph-image.jpg (and twitter-image.jpg) */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'You Are Here',
  openGraph: {
    type: 'website',
    siteName: 'You Are Here',
    title: 'The Solar System, at true scale',
    description: DESCRIPTION,
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Solar System, at true scale',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: '#020308',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
    >
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
