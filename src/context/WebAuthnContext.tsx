'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useToast } from '@chakra-ui/react'
import { createWeb3Passkey, Web3Passkey } from 'w3pk'

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
}

const WebAuthnContext = createContext<WebAuthnContextType>({
  isAuthenticated: false,
  user: null,
  isLoading: false,
  login: async () => {},
  register: async (username: string) => {},
  logout: () => {},
  signMessage: async (message: string) => null,
})

export const useWebAuthn = () => useContext(WebAuthnContext)

interface WebAuthnProviderProps {
  children: ReactNode
}

export const WebAuthnProvider: React.FC<WebAuthnProviderProps> = ({ children }) => {
  const [w3pk, setW3pk] = useState<Web3Passkey | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<WebAuthnUser | null>(null)
  const toast = useToast()

  const API_BASE_URL = process.env.NEXT_PUBLIC_WEBAUTHN_API_URL

  // Initialize w3pk SDK
  useEffect(() => {
    if (!API_BASE_URL) {
      console.error('NEXT_PUBLIC_WEBAUTHN_API_URL is not set')
      return
    }

    const sdk = createWeb3Passkey({
      apiBaseUrl: API_BASE_URL,
      debug: process.env.NODE_ENV === 'development',
      onError: error => {
        console.error('w3pk Error:', error)
        toast({
          title: 'Error',
          description: error.message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      },
      onAuthStateChanged: (isAuth, w3pkUser) => {
        console.log('Auth state changed:', isAuth, w3pkUser?.username)
        // Update React state when SDK auth state changes
        setIsAuthenticated(isAuth)
        setUser(w3pkUser as WebAuthnUser | null)
      },
    })

    setW3pk(sdk)

    // Initialize auth state from SDK
    setIsAuthenticated(sdk.isAuthenticated)
    setUser(sdk.user as WebAuthnUser | null)
  }, [API_BASE_URL, toast])

  const register = async (username: string) => {
    if (!w3pk) {
      throw new Error('SDK not initialized')
    }

    try {
      setIsLoading(true)
      console.log('=== Starting Registration ===')

      // w3pk handles everything internally now
      const result = await w3pk.register({ username })

      toast({
        title: 'Registration Successful',
        description: result.mnemonic
          ? `Your wallet has been created. IMPORTANT: Save this mnemonic: ${result.mnemonic}`
          : 'Your encrypted wallet has been created and stored securely',
        status: 'success',
        duration: result.mnemonic ? 30000 : 5000, // Longer if showing mnemonic
        isClosable: true,
      })

      if (result.mnemonic) {
        // Show a second toast as a backup reminder
        setTimeout(() => {
          toast({
            title: '⚠️ Backup Reminder',
            description: 'Did you save your mnemonic? You will need it to recover your wallet.',
            status: 'warning',
            duration: 10000,
            isClosable: true,
          })
        }, 2000)
      }
    } catch (error: any) {
      console.error('Registration failed:', error)
      // Error already handled by onError callback
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const login = async () => {
    if (!w3pk) {
      throw new Error('SDK not initialized')
    }

    try {
      setIsLoading(true)
      console.log('=== Starting Authentication ===')

      const result = await w3pk.login()

      if (result.verified && result.user) {
        // Check if wallet exists on this device
        const hasWallet = await w3pk.hasWallet()

        toast({
          title: 'Login Successful',
          description: hasWallet
            ? `Welcome back, ${result.user.username}! Your wallet is available.`
            : `Welcome back, ${result.user.username}! No wallet found on this device.`,
          status: hasWallet ? 'success' : 'warning',
          duration: 5000,
          isClosable: true,
        })
      }
    } catch (error: any) {
      console.error('Authentication failed:', error)
      // Error already handled by onError callback
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signMessage = async (message: string): Promise<string | null> => {
    if (!w3pk) {
      toast({
        title: 'Error',
        description: 'SDK not initialized',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return null
    }

    if (!w3pk.isAuthenticated) {
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
      console.log('=== Starting Message Signing ===')

      const signature = await w3pk.signMessage(message)

      toast({
        title: 'Message Signed Successfully',
        description: 'Your message has been cryptographically signed with fresh authentication',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      return signature
    } catch (error: any) {
      console.error('Message signing failed:', error)
      // Error already handled by onError callback
      return null
    }
  }

  const logout = () => {
    if (!w3pk) return

    w3pk.logout()

    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out. Your wallet remains on this device.',
      status: 'info',
      duration: 4000,
      isClosable: true,
    })
  }

  return (
    <WebAuthnContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        login,
        register,
        logout,
        signMessage,
      }}
    >
      {children}
    </WebAuthnContext.Provider>
  )
}
