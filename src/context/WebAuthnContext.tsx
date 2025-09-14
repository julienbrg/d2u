'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { useToast } from '@chakra-ui/react'

interface WebAuthnUser {
  id: string
  username: string
  displayName: string
}

interface WebAuthnContextType {
  isAuthenticated: boolean
  user: WebAuthnUser | null
  isLoading: boolean
  login: () => Promise<void>
  register: (username: string) => Promise<void>
  logout: () => void
}

const WebAuthnContext = createContext<WebAuthnContextType>({
  isAuthenticated: false,
  user: null,
  isLoading: false,
  login: async () => {},
  register: async (username: string) => {},
  logout: () => {},
})

export const useWebAuthn = () => useContext(WebAuthnContext)

interface WebAuthnProviderProps {
  children: ReactNode
}

export const WebAuthnProvider: React.FC<WebAuthnProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<WebAuthnUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const API_BASE_URL = process.env.NEXT_PUBLIC_WEBAUTHN_API_URL

  // Check if user is already authenticated on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('webauthn_user')
    const storedAuth = localStorage.getItem('webauthn_authenticated')

    if (storedUser && storedAuth === 'true') {
      try {
        const userData = JSON.parse(storedUser)
        setUser(userData)
        setIsAuthenticated(true)
      } catch (error) {
        console.error('Failed to parse stored user data:', error)
        localStorage.removeItem('webauthn_user')
        localStorage.removeItem('webauthn_authenticated')
      }
    }
  }, [])

  const register = async (username: string) => {
    try {
      setIsLoading(true)
      console.log('=== Starting Registration ===')
      console.log('Username:', username)
      console.log('API URL:', API_BASE_URL)

      // Step 1: Begin registration
      console.log('Step 1: Calling registration begin...')
      const beginResponse = await fetch(`${API_BASE_URL}/webauthn/register/begin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      })

      console.log('Begin registration response status:', beginResponse.status)

      if (!beginResponse.ok) {
        const errorText = await beginResponse.text()
        throw new Error(`Registration begin failed: ${beginResponse.status} - ${errorText}`)
      }

      const beginResult = await beginResponse.json()
      console.log('Begin registration result:', beginResult)

      // Extract the WebAuthn options and ethereum address from your API's response
      if (!beginResult.success || !beginResult.data) {
        throw new Error('Invalid response from registration begin endpoint')
      }

      const { options: webauthnOptions, ethereumAddress } = beginResult.data
      console.log('WebAuthn options:', webauthnOptions)
      console.log('Generated Ethereum address:', ethereumAddress)

      if (!webauthnOptions || !webauthnOptions.challenge) {
        throw new Error('Invalid WebAuthn options received')
      }

      // Step 2: Use browser WebAuthn API
      console.log('Step 2: Starting browser WebAuthn registration...')
      const credential = await startRegistration(webauthnOptions)
      console.log('Browser WebAuthn credential:', credential)

      // Step 3: Complete registration
      console.log('Step 3: Completing registration...')
      const completeResponse = await fetch(`${API_BASE_URL}/webauthn/register/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ethereumAddress,
          response: credential,
        }),
      })

      console.log('Complete registration response status:', completeResponse.status)

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text()
        throw new Error(`Registration complete failed: ${completeResponse.status} - ${errorText}`)
      }

      const completeResult = await completeResponse.json()
      console.log('Complete registration result:', completeResult)

      if (completeResult.success && completeResult.data && completeResult.data.user) {
        const userData: WebAuthnUser = {
          id: completeResult.data.user.id,
          username: completeResult.data.user.username,
          displayName: completeResult.data.user.username,
        }

        setUser(userData)
        setIsAuthenticated(true)
        localStorage.setItem('webauthn_user', JSON.stringify(userData))
        localStorage.setItem('webauthn_authenticated', 'true')

        toast({
          title: 'Registration Successful',
          description: `Welcome! Your passkey has been created with Ethereum address: ${ethereumAddress}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
      } else {
        throw new Error('Registration verification failed')
      }
    } catch (error: any) {
      console.error('Registration failed:', error)
      toast({
        title: 'Registration Failed',
        description: error.message || 'Failed to register passkey',
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
    if (!API_BASE_URL) {
      toast({
        title: 'Configuration Error',
        description: 'WebAuthn API URL seems unset.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    try {
      setIsLoading(true)
      console.log('=== Starting Usernameless Authentication ===')

      // Step 1: Begin usernameless authentication
      console.log('Step 1: Calling usernameless authentication begin...')
      const beginResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/begin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      console.log('Begin usernameless authentication response status:', beginResponse.status)

      if (!beginResponse.ok) {
        const errorText = await beginResponse.text()
        throw new Error(
          `Usernameless authentication begin failed: ${beginResponse.status} - ${errorText}`
        )
      }

      const beginResult = await beginResponse.json()
      console.log('Begin usernameless authentication result:', beginResult)

      // Extract WebAuthn options
      const webauthnOptions = beginResult.success ? beginResult.data.options : beginResult
      console.log('WebAuthn usernameless authentication options:', webauthnOptions)

      if (!webauthnOptions || !webauthnOptions.challenge) {
        throw new Error('Invalid WebAuthn usernameless authentication options received')
      }

      // Step 2: Use browser WebAuthn API
      console.log('Step 2: Starting browser WebAuthn usernameless authentication...')
      const credential = await startAuthentication(webauthnOptions)
      console.log('Browser WebAuthn usernameless assertion:', credential)

      // Step 3: Complete usernameless authentication
      console.log('Step 3: Completing usernameless authentication...')
      const completeResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            response: credential,
          }),
        }
      )

      console.log('Complete usernameless authentication response status:', completeResponse.status)

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text()
        throw new Error(
          `Usernameless authentication complete failed: ${completeResponse.status} - ${errorText}`
        )
      }

      const completeResult = await completeResponse.json()
      console.log('Complete usernameless authentication result:', completeResult)

      if (completeResult.success && completeResult.data && completeResult.data.user) {
        const userData: WebAuthnUser = {
          id: completeResult.data.user.id,
          username: completeResult.data.user.username,
          displayName: completeResult.data.user.username,
        }

        setUser(userData)
        setIsAuthenticated(true)
        localStorage.setItem('webauthn_user', JSON.stringify(userData))
        localStorage.setItem('webauthn_authenticated', 'true')

        toast({
          title: 'Login Successful',
          description: `Welcome back, ${userData.displayName}!`,
          status: 'success',
          duration: 7000,
          isClosable: true,
        })
      } else {
        throw new Error('Usernameless authentication verification failed')
      }
    } catch (error: any) {
      console.error('Usernameless authentication failed:', error)
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Failed to authenticate with passkey',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setIsAuthenticated(false)
    setUser(null)
    localStorage.removeItem('webauthn_user')
    localStorage.removeItem('webauthn_authenticated')

    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out',
      status: 'info',
      duration: 3000,
      isClosable: true,
    })
  }

  const value: WebAuthnContextType = {
    isAuthenticated,
    user,
    isLoading,
    login,
    register,
    logout,
  }

  return <WebAuthnContext.Provider value={value}>{children}</WebAuthnContext.Provider>
}
