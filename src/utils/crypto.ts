import { ethers } from 'ethers'

/**
 * Derives an encryption key from WebAuthn credential data
 * Used for encrypting sensitive data client-side
 */
export async function deriveEncryptionKey(
  credentialId: string,
  challenge: string
): Promise<CryptoKey> {
  try {
    const keyMaterial = new TextEncoder().encode(credentialId + challenge)

    const importedKey = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

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

    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)

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
 * Generates a new BIP39 wallet with HD derivation
 * Uses BIP44 path: m/44'/60'/0'/0/0 for Ethereum
 * Note: w3pk handles most wallet functionality, but this is kept for compatibility
 */
export function generateBIP39Wallet(): {
  address: string
  mnemonic: string
} {
  try {
    // Generate random mnemonic using ethers' utility
    const mnemonic = ethers.Wallet.createRandom().mnemonic

    if (!mnemonic) {
      throw new Error('Failed to generate mnemonic')
    }

    const mnemonicPhrase = mnemonic.phrase

    // Create HD wallet from mnemonic phrase with derivation path
    const derivationPath = "m/44'/60'/0'/0/0"
    const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonicPhrase, undefined, derivationPath)

    return {
      address: hdWallet.address,
      mnemonic: mnemonicPhrase,
    }
  } catch (error) {
    console.error('Failed to generate BIP39 wallet:', error)
    throw new Error('Wallet generation failed')
  }
}

/**
 * Creates wallet from mnemonic phrase
 * Uses BIP44 path: m/44'/60'/0'/0/0
 * Note: w3pk handles most wallet functionality, but this is kept for compatibility
 */
export function createWalletFromMnemonic(mnemonic: string): ethers.HDNodeWallet {
  try {
    if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
      throw new Error('Invalid mnemonic: must be at least 12 words')
    }

    // Create HD wallet with derivation path directly
    const derivationPath = "m/44'/60'/0'/0/0"
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, derivationPath)

    return wallet
  } catch (error) {
    console.error('Failed to create wallet from mnemonic:', error)
    throw new Error(
      'Wallet creation failed: ' + (error instanceof Error ? error.message : 'Invalid mnemonic')
    )
  }
}
