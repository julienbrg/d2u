import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stealth Voting - D2U',
  description: 'Coercion-resistant DAO voting with stealth addresses',
}

export default function VotingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}