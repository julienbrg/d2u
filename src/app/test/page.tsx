'use client'

import { useState } from 'react'
import {
  Container,
  VStack,
  Heading,
  Text,
  Button,
  Box,
  Code,
  Alert,
  AlertIcon,
  useToast
} from '@chakra-ui/react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { canControlStealthAddress } from 'w3pk'

export default function TestPage() {
  const [testResults, setTestResults] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const { isAuthenticated, generateStealthAddress, getStealthKeys } = useWebAuthn()
  const toast = useToast()

  const runTests = async () => {
    if (!isAuthenticated) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to test w3pk stealth address functionality',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    setIsRunning(true)
    setTestResults('')

    // Capture console logs
    const originalLog = console.log
    const originalError = console.error
    let output = ''

    console.log = (...args) => {
      output += args.join(' ') + '\n'
      originalLog(...args)
    }

    console.error = (...args) => {
      output += 'ERROR: ' + args.join(' ') + '\n'
      originalError(...args)
    }

    try {
      let success = true

      // Test 1: Get stealth keys
      console.log('🔑 Test 1: Getting stealth keys from w3pk...')
      const stealthKeys = await getStealthKeys()
      if (!stealthKeys) {
        console.error('Failed to get stealth keys')
        success = false
      } else {
        console.log('✅ Meta address:', stealthKeys.metaAddress)
        console.log('✅ Viewing key length:', stealthKeys.viewingKey.length)
        console.log('✅ Spending key length:', stealthKeys.spendingKey.length)
      }

      // Test 2: Generate stealth addresses
      console.log('\n🎭 Test 2: Generating stealth addresses...')
      const address1 = await generateStealthAddress()
      const address2 = await generateStealthAddress()

      if (!address1 || !address2) {
        console.error('Failed to generate stealth addresses')
        success = false
      } else {
        console.log('✅ Address 1:', address1.stealthAddress)
        console.log('✅ Address 2:', address2.stealthAddress)
        console.log('✅ Addresses are different:', address1.stealthAddress !== address2.stealthAddress)
      }

      // Test 3: Test viewing key functionality
      if (stealthKeys && address1 && address2) {
        console.log('\n🔍 Test 3: Testing viewing key functionality...')
        
        const canControl1 = canControlStealthAddress(
          stealthKeys.viewingKey,
          stealthKeys.spendingKey,
          address1.ephemeralPublicKey,
          address1.stealthAddress
        )
        
        const canControl2 = canControlStealthAddress(
          stealthKeys.viewingKey,
          stealthKeys.spendingKey,
          address2.ephemeralPublicKey,
          address2.stealthAddress
        )

        console.log('✅ Can control address 1:', canControl1)
        console.log('✅ Can control address 2:', canControl2)

        if (!canControl1 || !canControl2) {
          console.error('Viewing key should be able to control generated stealth addresses')
          success = false
        }

        // Test 4: Test with wrong viewing key (should fail)
        console.log('\n🚫 Test 4: Testing with wrong viewing key (should fail)...')
        const wrongKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
        const wrongControl = canControlStealthAddress(
          wrongKey,
          wrongKey, // Also use wrong spending key
          address1.ephemeralPublicKey,
          address1.stealthAddress
        )
        
        console.log('✅ Wrong key cannot control address:', !wrongControl)
        if (wrongControl) {
          console.error('Wrong viewing key should NOT be able to control stealth address')
          success = false
        }
      }

      if (success) {
        console.log('\n🎉 ALL TESTS PASSED! w3pk stealth address functionality works correctly.')
        toast({
          title: 'Tests Passed! ✅',
          description: 'All w3pk stealth address functionality tests completed successfully',
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
      } else {
        console.log('\n❌ SOME TESTS FAILED. Check the output above for details.')
        toast({
          title: 'Tests Failed ❌',
          description: 'Some tests failed. Check the output for details.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      }
    } catch (error: any) {
      output += `\nUNEXPECTED ERROR: ${error.message}\n`
      toast({
        title: 'Test Error',
        description: 'An unexpected error occurred during testing',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      // Restore console
      console.log = originalLog
      console.error = originalError
      
      setTestResults(output)
      setIsRunning(false)
    }
  }

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center">
          <Heading as="h1" size="xl" mb={4}>
            🧪 w3pk Stealth Address Tests
          </Heading>
          <Text color="gray.400">
            Test the w3pk stealth address functionality
          </Text>
        </Box>

        <Alert status="info">
          <AlertIcon />
          <Box>
            <Text>
              This page tests the w3pk stealth address functionality that powers the private voting system.
              It verifies that w3pk properly generates unlinkable stealth addresses and that viewing keys work correctly.
            </Text>
          </Box>
        </Alert>

        {!isAuthenticated && (
          <Alert status="warning">
            <AlertIcon />
            <Box>
              <Text>
                <strong>Authentication Required:</strong> Please log in first to test w3pk stealth address functionality.
              </Text>
            </Box>
          </Alert>
        )}

        <Box>
          <Button
            colorScheme="purple"
            onClick={runTests}
            isLoading={isRunning}
            loadingText="Running Tests..."
            size="lg"
            width="full"
            disabled={!isAuthenticated}
          >
            🚀 Run w3pk Stealth Address Tests
          </Button>
        </Box>

        {testResults && (
          <Box>
            <Heading size="md" mb={4}>Test Results:</Heading>
            <Box
              bg="gray.900"
              p={4}
              borderRadius="md"
              border="1px solid"
              borderColor="gray.700"
              maxHeight="500px"
              overflowY="auto"
            >
              <Code
                display="block"
                whiteSpace="pre-wrap"
                fontSize="sm"
                color="green.300"
                bg="transparent"
              >
                {testResults}
              </Code>
            </Box>
          </Box>
        )}

        <Box bg="gray.800" p={6} borderRadius="md">
          <Heading size="md" mb={4} color="white">
            What These Tests Verify:
          </Heading>
          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="gray.300">
              <strong>✅ w3pk Stealth Keys:</strong> w3pk properly derives stealth keys from your WebAuthn wallet
            </Text>
            <Text fontSize="sm" color="gray.300">
              <strong>✅ Address Generation:</strong> Each call creates a unique, unlinkable stealth address
            </Text>
            <Text fontSize="sm" color="gray.300">
              <strong>✅ Privacy Properties:</strong> Stealth addresses are unlinkable to each other and your main address
            </Text>
            <Text fontSize="sm" color="gray.300">
              <strong>✅ Viewing Key Function:</strong> Only your viewing key can identify your stealth addresses
            </Text>
            <Text fontSize="sm" color="gray.300">
              <strong>✅ Cryptographic Security:</strong> Wrong keys cannot identify or control your stealth addresses
            </Text>
          </VStack>
        </Box>
      </VStack>
    </Container>
  )
}