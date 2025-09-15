import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign Message | D2U',
  description: 'Cryptographically sign messages with your Ethereum wallet',

  openGraph: {
    title: 'Sign Message | D2U',
    description: 'Cryptographically sign messages with your Ethereum wallet',
    url: 'https://d2u.w3hc.org/web3',
    siteName: 'D2U',
    images: [
      {
        url: '/huangshan.png',
        width: 1200,
        height: 630,
        alt: 'D2U - Sign Message with WebAuthn and Ethereum',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Sign Message | D2U',
    description: 'Cryptographically sign messages with your Ethereum wallet',
    images: ['/huangshan.png'],
    creator: '@julienbrg',
  },
}

export default function Web3Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
