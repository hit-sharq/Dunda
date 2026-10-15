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
    
    
    
    
    
    
    
    
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}