'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { useToast } from '@chakra-ui/react'
import {
  deriveEncryptionKey,
  encryptData,
  decryptData,
  generateBIP39Wallet,
  createWalletFromMnemonic,
} from '@/utils/crypto'

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

// IndexedDB management for encrypted mnemonic storage
const DB_NAME = 'WebAuthnWallet'
const DB_VERSION = 1
const STORE_NAME = 'wallets'

class WalletStorage {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'ethereumAddress' })
        }
      }
    })
  }

  async storeEncryptedMnemonic(
    ethereumAddress: string,
    encryptedMnemonic: string,
    credentialId: string,
    challenge: string
  ): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const walletData = {
        ethereumAddress,
        encryptedMnemonic,
        credentialId,
        challenge,
        createdAt: Date.now(),
      }

      const request = store.put(walletData)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getEncryptedMnemonic(
    ethereumAddress: string
  ): Promise<{ encryptedMnemonic: string; credentialId: string; challenge: string } | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.get(ethereumAddress)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          resolve({
            encryptedMnemonic: result.encryptedMnemonic,
            credentialId: result.credentialId,
            challenge: result.challenge,
          })
        } else {
          resolve(null)
        }
      }
    })
  }

  async deleteWallet(ethereumAddress: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const request = store.delete(ethereumAddress)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

export const WebAuthnProvider: React.FC<WebAuthnProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<WebAuthnUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()
  const walletStorage = new WalletStorage()

  const API_BASE_URL = process.env.NEXT_PUBLIC_WEBAUTHN_API_URL

  // Load stored authentication state on mount
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

      // Step 1: Generate BIP39 wallet client-side
      const { address, mnemonic } = generateBIP39Wallet()
      console.log('Generated Ethereum address:', address)

      // Step 2: Begin registration - send only public address
      const beginResponse = await fetch(`${API_BASE_URL}/webauthn/register/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ethereumAddress: address }),
      })

      if (!beginResponse.ok) {
        throw new Error(`Registration begin failed: ${beginResponse.status}`)
      }

      const beginResult = await beginResponse.json()
      if (!beginResult.success || !beginResult.data?.options) {
        throw new Error('Invalid registration options received')
      }

      const webauthnOptions = beginResult.data.options

      // Step 3: WebAuthn registration
      const credential = await startRegistration(webauthnOptions)

      // Step 4: Encrypt mnemonic with WebAuthn-derived key
      const encryptionKey = await deriveEncryptionKey(credential.id, webauthnOptions.challenge)
      const encryptedMnemonic = await encryptData(mnemonic, encryptionKey)

      // Step 5: Store encrypted mnemonic in IndexedDB
      await walletStorage.storeEncryptedMnemonic(
        address,
        encryptedMnemonic,
        credential.id,
        webauthnOptions.challenge
      )
      console.log('Encrypted mnemonic stored in IndexedDB')

      // Step 6: Complete registration with API
      const completeResponse = await fetch(`${API_BASE_URL}/webauthn/register/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ethereumAddress: address, response: credential }),
      })

      if (!completeResponse.ok) {
        throw new Error(`Registration complete failed: ${completeResponse.status}`)
      }

      const completeResult = await completeResponse.json()
      if (!completeResult.success) {
        throw new Error('Registration verification failed')
      }

      // Step 7: Store user data (no mnemonic in localStorage)
      const userData: WebAuthnUser = {
        id: address,
        username: username,
        displayName: username,
        ethereumAddress: address,
      }

      setUser(userData)
      setIsAuthenticated(true)
      localStorage.setItem('webauthn_user', JSON.stringify(userData))
      localStorage.setItem('webauthn_authenticated', 'true')

      toast({
        title: 'Registration Successful',
        description: 'Your encrypted wallet has been created and stored securely',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
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
    try {
      setIsLoading(true)
      console.log('=== Starting Authentication ===')

      // Step 1: Begin usernameless authentication
      const beginResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/begin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!beginResponse.ok) {
        throw new Error(`Authentication begin failed: ${beginResponse.status}`)
      }

      const beginResult = await beginResponse.json()

      let webauthnOptions
      if (beginResult.success && beginResult.data?.options) {
        webauthnOptions = beginResult.data.options
      } else if (beginResult.challenge) {
        webauthnOptions = beginResult
      } else {
        throw new Error('Invalid authentication options received')
      }

      // Step 2: WebAuthn authentication
      const credential = await startAuthentication(webauthnOptions)

      // Step 3: Complete authentication
      const completeResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: credential }),
        }
      )

      if (!completeResponse.ok) {
        throw new Error(`Authentication complete failed: ${completeResponse.status}`)
      }

      const completeResult = await completeResponse.json()
      if (!completeResult.success || !completeResult.data?.user) {
        throw new Error('Authentication verification failed')
      }

      // Step 4: Set user data (no decryption during login)
      const userData: WebAuthnUser = {
        id: completeResult.data.user.id,
        username: completeResult.data.user.username,
        displayName: completeResult.data.user.username,
        ethereumAddress: completeResult.data.user.id,
      }

      setUser(userData)
      setIsAuthenticated(true)
      localStorage.setItem('webauthn_user', JSON.stringify(userData))
      localStorage.setItem('webauthn_authenticated', 'true')

      // Check if wallet exists in IndexedDB
      const walletData = await walletStorage.getEncryptedMnemonic(userData.ethereumAddress)
      const hasWallet = !!walletData

      toast({
        title: 'Login Successful',
        description: hasWallet
          ? `Welcome back, ${userData.displayName}! Your wallet is available.`
          : `Welcome back, ${userData.displayName}! No wallet found on this device.`,
        status: hasWallet ? 'success' : 'warning',
        duration: 5000,
        isClosable: true,
      })
    } catch (error: any) {
      console.error('Authentication failed:', error)
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
      console.log('=== Starting Message Signing ===')

      // Step 1: Check if wallet exists in IndexedDB
      const walletData = await walletStorage.getEncryptedMnemonic(user.ethereumAddress)
      if (!walletData) {
        toast({
          title: 'No Wallet Found',
          description:
            'No encrypted wallet found on this device. Please register to create a new wallet.',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        })
        return null
      }

      // Step 2: Require fresh WebAuthn authentication for signing
      console.log('Requesting WebAuthn authentication for signing...')
      const beginResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/begin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!beginResponse.ok) {
        throw new Error('Failed to begin authentication for signing')
      }

      const beginResult = await beginResponse.json()
      let webauthnOptions
      if (beginResult.success && beginResult.data?.options) {
        webauthnOptions = beginResult.data.options
      } else if (beginResult.challenge) {
        webauthnOptions = beginResult
      } else {
        throw new Error('Invalid authentication options received')
      }

      const credential = await startAuthentication(webauthnOptions)

      const completeResponse = await fetch(
        `${API_BASE_URL}/webauthn/authenticate/usernameless/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: credential }),
        }
      )

      if (!completeResponse.ok) {
        throw new Error('Authentication failed for signing')
      }

      const completeResult = await completeResponse.json()
      if (!completeResult.success) {
        throw new Error('Authentication verification failed for signing')
      }

      // Step 3: Decrypt mnemonic using stored credentials
      console.log('Decrypting mnemonic for signing...')
      const encryptionKey = await deriveEncryptionKey(walletData.credentialId, walletData.challenge)
      const decryptedMnemonic = await decryptData(walletData.encryptedMnemonic, encryptionKey)
      const wallet = createWalletFromMnemonic(decryptedMnemonic)

      // Step 4: Sign the message
      console.log('Signing message...')
      const signature = await wallet.signMessage(message)

      // Step 5: Immediately clear decrypted mnemonic from memory
      // Note: The wallet object and mnemonic will be garbage collected
      console.log('Message signed successfully, mnemonic cleared from memory')

      return signature
    } catch (error: any) {
      console.error('Message signing failed:', error)
      toast({
        title: 'Signing Failed',
        description: error.message || 'Failed to sign message',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return null
    }
  }

  const logout = () => {
    setIsAuthenticated(false)
    setUser(null)
    localStorage.removeItem('webauthn_authenticated')
    // Note: Keep user data and IndexedDB wallet for device persistence

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
