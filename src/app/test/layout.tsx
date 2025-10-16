import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'System Tests - D2U',
  description: 'Test the stealth voting system functionality',
}

export default function TestLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}