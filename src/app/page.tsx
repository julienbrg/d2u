'use client'

import { Container, Text, VStack, Button, Box, Heading } from '@chakra-ui/react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import Link from 'next/link'
import { useTranslation } from '@/hooks/useTranslation'

export default function Home() {
  const { isAuthenticated, user } = useWebAuthn()
  const t = useTranslation()

  return (
    <Container maxW="container.sm" py={20}>
      <VStack spacing={8} align="stretch">
        {isAuthenticated ? (
          <Box>
            <Text fontSize="lg" mb={2}>
              You&apos;re logged in as <strong>{user?.displayName || user?.username}</strong>!
            </Text>
            <Text fontSize="sm" mb={2}>
              User ID: {user?.id}{' '}
            </Text>
            {/* TODO: `src/app/webauthn/page.tsx`'s Store Files Tab content */}
          </Box>
        ) : (
          <Box bg="whiteAlpha.50" p={6} borderRadius="md" textAlign="center">
            <Text mb={4}>Please log in to access your personal record.</Text>
          </Box>
        )}
      </VStack>
    </Container>
  )
}
