import type { Metadata, Viewport } from 'next'
import './globals.css'
import './dunda.css'

export const metadata: Metadata = {
  title: {
    default: 'Dunda — The Club Operating System',
    template: '%s · Dunda',
  },
  description:
    'One platform to run your club: point of sale, tabs, floor and pool management, inventory, staff, events and reporting.',
  applicationName: 'Dunda',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0d0c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning on both tags is deliberate, for two separate
    // reasons.
    //
    // Clerk stamps an attribute onto <html> as it resolves the session, which
    // arrives after the server's HTML was already sent. And browser extensions
    // inject their own data-* attributes into <body> before React hydrates.
    // Neither is ours to control, and React would otherwise strip them and warn
    // about a mismatch that says nothing about what the page actually shows.
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
