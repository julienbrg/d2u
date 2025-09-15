'use client'

import {
  Container,
  Heading,
  Text,
  useToast,
  Button,
  Box,
  VStack,
  FormControl,
  FormLabel,
  Textarea,
  Alert,
  AlertIcon,
  AlertDescription,
  Code,
  Divider,
} from '@chakra-ui/react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { useState } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

export default function Web3() {
  const { isAuthenticated, user } = useWebAuthn()
  const t = useTranslation()
  const toast = useToast()

  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')
  const [isSigningMessage, setIsSigningMessage] = useState(false)

  const API_BASE_URL = process.env.NEXT_PUBLIC_WEBAUTHN_API_URL

  const handleSignMessage = async () => {
    if (!message.trim()) {
      toast({
        title: 'Message Required',
        description: 'Please enter a message to sign',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setIsSigningMessage(true)
      console.log('=== Starting Message Signing ===')
      console.log('User ID:', user?.id)
      console.log('Message to sign:', message)

      const response = await fetch(`${API_BASE_URL}/web3/sign-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ethereumAddress: user?.id,
          message: message.trim(),
        }),
      })

      console.log('Sign message response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Message signing failed: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log('Sign message result:', result)

      if (result.success && result.data?.signature) {
        setSignature(result.data.signature)

        toast({
          title: 'Message Signed Successfully',
          description: 'Your message has been cryptographically signed',
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
      } else {
        throw new Error(result.message || 'Failed to sign message')
      }
    } catch (error: any) {
      console.error('Message signing failed:', error)
      toast({
        title: 'Signing Failed',
        description: error.message || 'Failed to sign message',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsSigningMessage(false)
    }
  }

  const clearSignature = () => {
    setSignature('')
    setMessage('')
  }

  const copySignature = () => {
    navigator.clipboard.writeText(signature)
    toast({
      title: 'Copied',
      description: 'Signature copied to clipboard',
      status: 'info',
      duration: 2000,
      isClosable: true,
    })
  }

  if (!isAuthenticated) {
    return (
      <Container maxW="container.sm" py={20}>
        <VStack spacing={8} align="stretch">
          <Box bg="whiteAlpha.50" p={6} borderRadius="md" textAlign="center">
            <Alert status="warning" bg="transparent" color="orange.200">
              <AlertIcon />
              <AlertDescription>
                Please log in to access message signing functionality.
              </AlertDescription>
            </Alert>
          </Box>
        </VStack>
      </Container>
    )
  }

  return (
    <Container maxW="container.md" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center">
          <Heading as="h1" size="lg" mb={4}>
            Sign Message
          </Heading>
          <Text color="gray.400" mb={6}>
            Cryptographically sign a message with your Ethereum wallet
          </Text>
        </Box>

        <VStack spacing={6} align="stretch">
          <Text fontSize="sm" color="gray.400">
            Logged in as: <strong>{user?.displayName || user?.username}</strong> (ID: {user?.id})
          </Text>

          <Divider />

          <FormControl>
            <FormLabel>Message to Sign</FormLabel>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Enter the message you want to sign..."
              bg="gray.700"
              border="1px solid"
              borderColor="gray.600"
              _hover={{ borderColor: 'gray.500' }}
              _focus={{ borderColor: '#8c1c84', boxShadow: '0 0 0 1px #8c1c84' }}
              resize="vertical"
              minH="100px"
            />
          </FormControl>

          <Button
            bg="#8c1c84"
            color="white"
            _hover={{ bg: '#6d1566' }}
            onClick={handleSignMessage}
            isLoading={isSigningMessage}
            loadingText="Signing..."
            isDisabled={!message.trim()}
            size="lg"
          >
            Sign Message
          </Button>

          {signature && (
            <Box>
              <Divider mb={4} />
              <FormControl>
                <FormLabel>Signature</FormLabel>
                <Box position="relative">
                  <Code
                    display="block"
                    whiteSpace="pre-wrap"
                    wordBreak="break-all"
                    bg="gray.700"
                    p={4}
                    borderRadius="md"
                    fontSize="sm"
                    maxH="200px"
                    overflowY="auto"
                  >
                    {signature}
                  </Code>
                </Box>

                <VStack spacing={3} mt={4}>
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    onClick={copySignature}
                    size="sm"
                    width="full"
                  >
                    Copy Signature
                  </Button>
                  <Button
                    variant="ghost"
                    colorScheme="gray"
                    onClick={clearSignature}
                    size="sm"
                    width="full"
                  >
                    Clear
                  </Button>
                </VStack>
              </FormControl>
            </Box>
          )}
        </VStack>

        <Box bg="gray.800" p={4} borderRadius="md">
          <Text fontSize="sm" color="gray.400" mb={2}>
            <strong>About Message Signing:</strong>
          </Text>
          <Text fontSize="xs" color="gray.500" mb={3}>
            Message signing creates a cryptographic proof that you control the Ethereum wallet
            associated with your account. This signature can be verified by anyone to prove message
            authenticity.
          </Text>
          <Text fontSize="xs" color="gray.500">
            You can verify signatures on{' '}
            <Text
              as="a"
              href="https://etherscan.io/verifiedSignatures#"
              target="_blank"
              rel="noopener noreferrer"
              color="blue.300"
              textDecoration="underline"
              _hover={{ color: 'blue.200' }}
            >
              Etherscan&apos;s Verify Signature tool
            </Text>{' '}
            (click on &quot;Verify Signature&quot;).
          </Text>
        </Box>
      </VStack>
    </Container>
  )
}
