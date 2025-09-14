import { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://d2u.w3hc.org'),

  title: 'D2U',
  description: 'UI for NestJS-based WebAuthn auth service',

  keywords: ['WebAuthn', 'Next.js', 'Web3'],
  authors: [{ name: 'Julien', url: 'https://github.com/julienbrg' }],

  openGraph: {
    title: 'D2U',
    description: 'UI for NestJS-based WebAuthn auth service',
    url: 'https://d2u.w3hc.org',
    siteName: 'D2U',
    images: [
      {
        url: '/huangshan.png',
        width: 1200,
        height: 630,
        alt: 'UI for NestJS-based WebAuthn auth service',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'D2U',
    description: 'UI for NestJS-based WebAuthn auth service',
    images: ['/huangshan.png'],
    creator: '@julienbrg',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  verification: {
    google: 'your-google-site-verification',
  },
}
