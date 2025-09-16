import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upload Files | D2U',
  description: 'Upload and manage your files',

  openGraph: {
    title: 'Upload Files | D2U',
    description: 'Upload and manage your files',
    url: 'https://d2u.w3hc.org/upload',
    siteName: 'D2U',
    images: [
      {
        url: '/huangshan.png',
        width: 1200,
        height: 630,
        alt: 'D2U - Secure File Upload with WebAuthn',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Upload Files | D2U',
    description: 'Upload and manage your files',
    images: ['/huangshan.png'],
    creator: '@julienbrg',
  },
}

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
