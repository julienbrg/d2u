'use client'

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
  useEffect,
} from 'react'
import { useToast } from '@chakra-ui/react'
import { createWeb3Passkey, StealthKeys } from 'w3pk'

interface WebAuthnUser {
  id: string
  username: string
  displayName: string
  ethereumAddress: string
}

interface WebAuthnContextType {
  isAuthenticated: boolean
  user: WebAuthnUser | null
  isLoading: boolean
  login: () => Promise<void>
  register: (username: string) => Promise<void>
  logout: () => void
  signMessage: (message: string) => Promise<string | null>
  generateStealthAddress: () => Promise<{
    stealthAddress: string
    stealthPrivateKey: string
    ephemeralPublicKey: string
  } | null>
  getStealthKeys: () => Promise<StealthKeys | null>
}

const WebAuthnContext = createContext<WebAuthnContextType>({
  isAuthenticated: false,
  user: null,
  isLoading: false,
  login: async () => {},
  register: async (username: string) => {},
  logout: () => {},
  signMessage: async (message: string) => null,
  generateStealthAddress: async () => null,
  getStealthKeys: async () => null,
})

export const useWebAuthn = () => useContext(WebAuthnContext)

interface WebAuthnProviderProps {
  children: ReactNode
}

export const WebAuthnProvider: React.FC<WebAuthnProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<WebAuthnUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const toast = useToast()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Stable callback to prevent w3pk re-creation
  const handleAuthStateChanged = useCallback((isAuth: boolean, w3pkUser?: any) => {
    if (isAuth && w3pkUser) {
      const userData: WebAuthnUser = {
        id: w3pkUser.id,
        username: w3pkUser.username,
        displayName: w3pkUser.displayName,
        ethereumAddress: w3pkUser.ethereumAddress,
      }
      setUser(userData)
      setIsAuthenticated(true)
    } else {
      setUser(null)
      setIsAuthenticated(false)
    }
  }, [])

  // Initialize w3pk SDK with stealth address capabilities - memoized to prevent re-creation
  const w3pk = useMemo(
    () =>
      createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        stealthAddresses: {}, // Enable stealth address generation
        debug: process.env.NODE_ENV === 'development',
        onAuthStateChanged: handleAuthStateChanged,
      }),
    [handleAuthStateChanged]
  )

  // w3pk handles auth state changes via onAuthStateChanged callback above
  // No manual useEffect needed since w3pk manages its own state

  const register = async (username: string) => {
    try {
      setIsLoading(true)
      console.log('=== Starting Registration with w3pk ===')

      // Use w3pk for registration
      const result = await w3pk.register({ username })
      console.log('Registration successful, address:', result.ethereumAddress)

      toast({
        title: 'Registration Successful! 🎉',
        description: 'Your encrypted wallet has been created and stored securely with w3pk',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // If a mnemonic was generated, show backup warning
      if (result.mnemonic) {
        toast({
          title: '🚨 BACKUP YOUR RECOVERY PHRASE',
          description:
            'Save your 12-word recovery phrase in a safe place. This is your only backup!',
          status: 'warning',
          duration: 10000,
          isClosable: true,
        })
      }
    } catch (error: any) {
      console.error('Registration failed:', error)
      toast({
        title: 'Registration Failed',
        description: error.message || 'Failed to register with w3pk',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const login = async () => {
    try {
      setIsLoading(true)
      console.log('=== Starting Login with w3pk ===')

      // Use w3pk for login - it handles everything internally
      const result = await w3pk.login()
      console.log('Login successful, user:', result.user?.username)

      // Check if wallet is available
      const hasWallet = await w3pk.hasWallet()

      toast({
        title: 'Login Successful! ✅',
        description: hasWallet
          ? `Welcome back, ${result.user?.displayName}! Your wallet is available.`
          : `Welcome back, ${result.user?.displayName}! No wallet found on this device.`,
        status: hasWallet ? 'success' : 'warning',
        duration: 5000,
        isClosable: true,
      })
    } catch (error: any) {
      console.error('Authentication failed:', error)
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Failed to authenticate with w3pk',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signMessage = async (message: string): Promise<string | null> => {
    if (!user) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in first',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return null
    }

    try {
      console.log('=== Starting Message Signing with w3pk ===')

      // Use w3pk for message signing - it handles fresh WebAuthn authentication automatically
      const signature = await w3pk.signMessage(message)
      console.log('Message signed successfully')

      return signature
    } catch (error: any) {
      console.error('Message signing failed:', error)
      toast({
        title: 'Signing Failed',
        description: error.message || 'Failed to sign message with w3pk',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return null
    }
  }

  const logout = () => {
    // Use w3pk logout
    w3pk.logout()

    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out. Your wallet remains on this device.',
      status: 'info',
      duration: 4000,
      isClosable: true,
    })
  }

  const generateStealthAddress = async (): Promise<{
    stealthAddress: string
    stealthPrivateKey: string
    ephemeralPublicKey: string
  } | null> => {
    if (!user) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in first',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return null
    }

    try {
      console.log('=== Generating Stealth Address with w3pk ===')

      if (!w3pk.stealth) {
        throw new Error('Stealth address module not initialized')
      }

      // Generate stealth address using w3pk
      const stealthResult = await w3pk.stealth.generateStealthAddress()
      console.log('Stealth address generated:', stealthResult.stealthAddress)

      return stealthResult
    } catch (error: any) {
      console.error('Stealth address generation failed:', error)
      toast({
        title: 'Stealth Address Failed',
        description: error.message || 'Failed to generate stealth address',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return null
    }
  }

  const getStealthKeys = async (): Promise<StealthKeys | null> => {
    if (!user) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in first',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return null
    }

    try {
      console.log('=== Getting Stealth Keys with w3pk ===')

      if (!w3pk.stealth) {
        throw new Error('Stealth address module not initialized')
      }

      // Get stealth keys using w3pk
      const stealthKeys = await w3pk.stealth.getKeys()
      console.log('Stealth keys retrieved, meta address:', stealthKeys.metaAddress)

      return stealthKeys
    } catch (error: any) {
      console.error('Failed to get stealth keys:', error)
      toast({
        title: 'Stealth Keys Failed',
        description: error.message || 'Failed to get stealth keys',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return null
    }
  }

  return (
    <WebAuthnContext.Provider
      value={{
        isAuthenticated: isMounted && isAuthenticated,
        user,
        isLoading,
        login,
        register,
        logout,
        signMessage,
        generateStealthAddress,
        getStealthKeys,
      }}
    >
      {children}
    </WebAuthnContext.Provider>
  )
}
