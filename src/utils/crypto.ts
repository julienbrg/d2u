import { ethers } from 'ethers'

/**
 * Derives an encryption key from WebAuthn credential data
 */
export async function deriveEncryptionKey(
  credentialId: string,
  challenge: string
): Promise<CryptoKey> {
  try {
    // Combine credential ID and challenge for key derivation
    const keyMaterial = new TextEncoder().encode(credentialId + challenge)

    // Import as raw key material
    const importedKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    // Derive AES-GCM key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('webauthn-wallet-salt-d2u'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      importedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  } catch (error) {
    console.error('Failed to derive encryption key:', error)
    throw new Error('Encryption key derivation failed')
  }
}

/**
 * Encrypts data using AES-GCM
 */
export async function encryptData(data: string, key: CryptoKey): Promise<string> {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encodedData = new TextEncoder().encode(data)

    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedData)

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

    // Return as base64
    return btoa(String.fromCharCode(...combined))
  } catch (error) {
    console.error('Failed to encrypt data:', error)
    throw new Error('Data encryption failed')
  }
}

/**
 * Decrypts data using AES-GCM
 */
export async function decryptData(encryptedData: string, key: CryptoKey): Promise<string> {
  try {
    if (!encryptedData || encryptedData.length < 16) {
      throw new Error('Invalid encrypted data: too small')
    }

    const combined = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map(char => char.charCodeAt(0))
    )

    if (combined.length < 12) {
      throw new Error('Invalid encrypted data: missing IV')
    }

    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    if (encrypted.length === 0) {
      throw new Error('Invalid encrypted data: no content')
    }

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)

    return new TextDecoder().decode(decrypted)
  } catch (error) {
    console.error('Failed to decrypt data:', error)
    throw new Error(
      'Data decryption failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Generates a new Ethereum wallet
 */
export function generateEthereumWallet(): { address: string; privateKey: string } {
  try {
    const wallet = ethers.Wallet.createRandom()
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    }
  } catch (error) {
    console.error('Failed to generate Ethereum wallet:', error)
    throw new Error('Wallet generation failed')
  }
}

/**
 * Creates wallet from private key
 */
export function createWalletFromPrivateKey(privateKey: string): ethers.Wallet {
  try {
    if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error('Invalid private key format')
    }
    return new ethers.Wallet(privateKey)
  } catch (error) {
    console.error('Failed to create wallet from private key:', error)
    throw new Error(
      'Wallet creation failed: ' + (error instanceof Error ? error.message : 'Invalid private key')
    )
  }
}
