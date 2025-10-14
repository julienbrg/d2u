'use client'

// Add ethereum type declaration
declare global {
  interface Window {
    ethereum?: any
  }
}

import {
  Container,
  VStack,
  Heading,
  Text,
  Box,
  Button,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Progress,
  useToast,
  Flex,
  Icon,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Textarea,
  FormControl,
  FormLabel,
  Divider,
} from '@chakra-ui/react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { useState, useEffect } from 'react'
import { FiCheckCircle, FiXCircle, FiMinusCircle, FiClock, FiPlus } from 'react-icons/fi'
import { ethers } from 'ethers'

// Contract addresses - Define before component
const STEALTH_GOV_ADDRESS = '0x7005CE8B623Ad7d7B112436c5315d2622bB96Ed7'
const SBT_CONTRACT_ADDRESS = '0x991131B03Cd6feB99a814F7920a759e6838DFA81'
// const SEPOLIA_RPC_URL = 'https://gateway.tenderly.co/public/sepolia'
const SEPOLIA_RPC_URL = 'https://sepolia.infura.io/v3/85c7342e76ff4abdba62b31c07c53499'

// Validate contract address format
const isValidAddress = (address: string): boolean => {
  return address && address.length === 42 && address.startsWith('0x')
}

// StealthGov contract ABI
const STEALTH_GOV_ABI = [
  // Proposal Management
  'function proposalCount() view returns (uint256)',
  'function getProposal(uint256 proposalId) view returns (string description, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool executed)',
  'function isProposalActive(uint256 proposalId) view returns (bool)',

  // Proposal Creation (anyone with SBT can create)
  'function createProposal(string description) returns (uint256)',
  'function createStealthProposal(string description, bytes stealthProof, uint256 sbtTokenId) returns (uint256)',

  // Voting Functions
  'function castStealthVote(uint256 proposalId, uint8 support, bytes ephemeralPubkey, bytes stealthProof, uint256 sbtTokenId)',
  'function changeStealthVote(uint256 proposalId, uint8 newSupport, bytes newEphemeralPubkey, bytes stealthProof, uint256 originalSbtTokenId)',

  // Stealth Authorization
  'function createStealthAuthorization(address stealthMetaAddress, bytes authorizationSignature)',
  'function revokeStealthAuthorization()',
  'function getStealthAuthorization(address sbtHolder) view returns (tuple(address sbtHolderAddress, address stealthMetaAddress, bytes authorizationSignature, uint256 timestamp, bool isActive))',

  // Query Functions
  'function getStealthVotes(uint256 proposalId) view returns (tuple(address stealthAddress, uint8 support, bytes ephemeralPubkey, uint256 timestamp, uint256 voteChangeCount, bool isLatest, uint256 sbtTokenId)[])',
  'function getVoteChangeHistory(uint256 proposalId) view returns (tuple(uint8 oldSupport, uint8 newSupport, uint256 timestamp, address stealthAddress, uint256 sbtTokenId)[])',
  'function isSBTTokenUsed(uint256 proposalId, uint256 sbtTokenId) view returns (bool)',
  'function hasStealthVoted(uint256 proposalId, address stealthAddress) view returns (bool)',

  // Contract Info
  'function getSBTContract() view returns (address)',
]

// SBT contract ABI
const SBT_ABI = [
  'function mintHumanityToken(address to) returns (uint256)',
  'function batchMintHumanityTokens(address[] recipients)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function isValidHuman(address account) view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenOfOwner(address owner) view returns (uint256)',
]

interface ProposalData {
  id: number
  description: string
  startTime: number
  endTime: number
  forVotes: number
  againstVotes: number
  abstainVotes: number
  executed: boolean
  isActive: boolean
}

export default function VotingPage() {
  const { isAuthenticated, user, generateStealthAddress, signMessage } = useWebAuthn()
  const toast = useToast()
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure()

  // Get w3pk instance from context
  const [w3pkWallet, setW3pkWallet] = useState<any>(null)

  const [proposals, setProposals] = useState<ProposalData[]>([])
  const [isLoadingProposals, setIsLoadingProposals] = useState(false)
  const [isVoting, setIsVoting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newProposalDescription, setNewProposalDescription] = useState('')
  const [hasSBT, setHasSBT] = useState(false)
  const [sbtTokenId, setSbtTokenId] = useState<number | null>(null)
  const [isMintingSBT, setIsMintingSBT] = useState(false)
  const [sbtContractAddress, setSbtContractAddress] = useState<string>(SBT_CONTRACT_ADDRESS)
  const [ethBalance, setEthBalance] = useState<string>('0')
  const [isCheckingBalance, setIsCheckingBalance] = useState(false)
  const [isFundingWallet, setIsFundingWallet] = useState(false)

  // Fetch proposals and check SBT on component mount
  useEffect(() => {
    fetchProposals()
    if (isAuthenticated && user?.ethereumAddress) {
      checkEthBalance()
      checkSBTStatus()
    }
  }, [isAuthenticated, user?.ethereumAddress])

  const fetchProposals = async () => {
    // Check if contract address is configured
    if (!isValidAddress(STEALTH_GOV_ADDRESS)) {
      console.warn('Contract address not configured')
      setProposals([])
      setIsLoadingProposals(false)
      return
    }

    setIsLoadingProposals(true)
    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const contract = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, provider)

      // Get total proposal count
      const count = await contract.proposalCount()
      const proposalCount = Number(count)

      console.log('Total proposals:', proposalCount)

      if (proposalCount === 0) {
        setProposals([])
        setIsLoadingProposals(false)
        return
      }

      // Fetch all proposals
      const proposalPromises = []
      for (let i = 0; i < proposalCount; i++) {
        proposalPromises.push(fetchProposalData(contract, i))
      }

      const fetchedProposals = await Promise.all(proposalPromises)
      setProposals(fetchedProposals.filter(p => p !== null) as ProposalData[])
    } catch (error: any) {
      console.error('Error fetching proposals:', error)
      toast({
        title: 'Error Fetching Proposals',
        description: error.message || 'Failed to load proposals from blockchain',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsLoadingProposals(false)
    }
  }

  const fetchProposalData = async (
    contract: ethers.Contract,
    proposalId: number
  ): Promise<ProposalData | null> => {
    try {
      const [description, startTime, endTime, forVotes, againstVotes, abstainVotes, executed] =
        await contract.getProposal(proposalId)

      const isActive = await contract.isProposalActive(proposalId)

      return {
        id: proposalId,
        description,
        startTime: Number(startTime),
        endTime: Number(endTime),
        forVotes: Number(forVotes),
        againstVotes: Number(againstVotes),
        abstainVotes: Number(abstainVotes),
        executed,
        isActive,
      }
    } catch (error) {
      console.error(`Error fetching proposal ${proposalId}:`, error)
      return null
    }
  }

  const checkSBTStatus = async () => {
    if (!user?.ethereumAddress) return

    const sbtAddress = SBT_CONTRACT_ADDRESS

    if (!sbtAddress || !isValidAddress(sbtAddress)) {
      console.warn('SBT contract address not available')
      return
    }

    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const sbtContract = new ethers.Contract(sbtAddress, SBT_ABI, provider)

      // Check if user has SBT
      const balance = await sbtContract.balanceOf(user.ethereumAddress)
      const hasToken = Number(balance) > 0

      setHasSBT(hasToken)

      if (hasToken) {
        // Get the token ID
        const tokenId = await sbtContract.tokenOfOwnerByIndex(user.ethereumAddress, 0)
        setSbtTokenId(Number(tokenId))
      }
    } catch (error) {
      console.error('Error checking SBT status:', error)
    }
  }

  const checkEthBalance = async () => {
    if (!user?.ethereumAddress) return

    setIsCheckingBalance(true)
    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const balance = await provider.getBalance(user.ethereumAddress)
      const balanceInEth = ethers.formatEther(balance)
      setEthBalance(balanceInEth)

      // If balance is 0, trigger faucet
      if (balance === 0n) {
        await triggerFaucet()
      }
    } catch (error) {
      console.error('Error checking ETH balance:', error)
    } finally {
      setIsCheckingBalance(false)
    }
  }

  const triggerFaucet = async () => {
    if (!user?.ethereumAddress) return

    setIsFundingWallet(true)
    try {
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: user.ethereumAddress }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Wallet Funded! 💰',
          description: `Received 0.001 ETH from faucet. Transaction: ${data.txHash}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        })

        // Wait a bit for transaction to be mined, then refresh balance
        setTimeout(() => checkEthBalance(), 3000)
      } else {
        console.error('Faucet error:', data.error)
        toast({
          title: 'Faucet Failed',
          description: data.error || 'Failed to get ETH from faucet',
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      }
    } catch (error: any) {
      console.error('Error triggering faucet:', error)
      toast({
        title: 'Faucet Error',
        description: 'Failed to request ETH from faucet',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsFundingWallet(false)
    }
  }

  const handleMintSBT = async () => {
    const sbtAddress = SBT_CONTRACT_ADDRESS

    if (!sbtAddress || !isValidAddress(sbtAddress)) {
      toast({
        title: 'SBT Contract Not Configured',
        description: 'SBT contract address is invalid',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    if (!user?.ethereumAddress) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in first',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setIsMintingSBT(true)

      console.log('🎭 Starting SBT minting process...')
      console.log('User address:', user.ethereumAddress)
      console.log('SBT contract:', sbtAddress)

      // First check if user already has an SBT
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const sbtContract = new ethers.Contract(sbtAddress, SBT_ABI, provider)

      console.log('Checking if user already has SBT...')
      const balance = await sbtContract.balanceOf(user.ethereumAddress)
      console.log('SBT balance:', balance.toString())

      if (Number(balance) > 0) {
        toast({
          title: 'Already Have SBT',
          description: 'You already have a Soul Bound Token',
          status: 'info',
          duration: 5000,
          isClosable: true,
        })
        await checkSBTStatus()
        return
      }

      // Check if address is valid human
      try {
        const isValid = await sbtContract.isValidHuman(user.ethereumAddress)
        console.log('Is valid human:', isValid)

        if (isValid) {
          toast({
            title: 'Already Verified',
            description: 'This address is already verified as human',
            status: 'info',
            duration: 5000,
            isClosable: true,
          })
        }
      } catch (e) {
        console.log('Could not check isValidHuman (function may not exist)')
      }

      // Check if address is valid human
      console.log('Checking if user is valid human...')
      try {
        const isValid = await sbtContract.isValidHuman(user.ethereumAddress)
        console.log('Is valid human:', isValid)

        if (isValid) {
          toast({
            title: 'Already Verified',
            description: 'This address is already verified as human',
            status: 'info',
            duration: 5000,
            isClosable: true,
          })
        }
      } catch (e) {
        console.log('Could not check isValidHuman (function may not exist)')
      }
      const ethBalance = await provider.getBalance(user.ethereumAddress)
      console.log('ETH balance:', ethers.formatEther(ethBalance))

      if (ethBalance === 0n) {
        toast({
          title: 'Insufficient ETH',
          description: 'Waiting for faucet to fund your wallet. Please try again in a moment.',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        })
        return
      }

      toast({
        title: 'Authenticating...',
        description: 'Please complete WebAuthn authentication',
        status: 'info',
        duration: 3000,
        isClosable: true,
      })

      // Import w3pk and get wallet at index 0
      const { createWeb3Passkey } = await import('w3pk')

      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        stealthAddresses: {},
      })

      // Derive wallet at index 0 (triggers WebAuthn)
      const walletInfo = await w3pk.deriveWallet(0)

      if (!walletInfo || !walletInfo.privateKey) {
        throw new Error('Failed to derive wallet. Please authenticate again.')
      }

      console.log('Wallet derived at index 0:', walletInfo.address)

      // Verify address matches
      if (walletInfo.address.toLowerCase() !== user.ethereumAddress.toLowerCase()) {
        console.warn('Address mismatch:', {
          derived: walletInfo.address,
          expected: user.ethereumAddress,
        })
      }

      // Create wallet with signer
      const wallet = new ethers.Wallet(walletInfo.privateKey, provider)

      console.log('Ethers wallet created')

      // Create SBT contract instance with signer
      const sbtContractWithSigner = new ethers.Contract(sbtAddress, SBT_ABI, wallet)

      toast({
        title: 'Minting SBT...',
        description: 'Sending transaction to blockchain...',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      // Mint SBT
      console.log('Calling mintHumanityToken() function...')
      const tx = await sbtContractWithSigner.mintHumanityToken(walletInfo.address)
      console.log('Transaction sent:', tx.hash)

      toast({
        title: 'Transaction Sent! ⏳',
        description: `Waiting for confirmation... TX: ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      // Wait for confirmation
      const receipt = await tx.wait()
      console.log('Transaction confirmed:', receipt)

      toast({
        title: 'SBT Minted Successfully! 🎉',
        description: 'You can now create proposals and vote',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // Refresh SBT status
      await checkSBTStatus()
    } catch (error: any) {
      console.error('Error minting SBT:', error)

      let errorMessage = error.message || 'Failed to mint SBT'

      // Handle common errors
      if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance. Wait for faucet funding to complete.'
      } else if (
        error.message?.includes('user rejected') ||
        error.message?.includes('User cancelled')
      ) {
        errorMessage = 'Authentication cancelled'
      } else if (error.message?.includes('execution reverted')) {
        errorMessage =
          'Contract rejected transaction. You may already have an SBT or requirements not met.'
      } else if (error.code === 'CALL_EXCEPTION') {
        errorMessage =
          'Transaction would fail. Possible reasons: already have SBT, insufficient ETH, or contract requirements not met.'
      }

      toast({
        title: 'SBT Minting Failed',
        description: errorMessage,
        status: 'error',
        duration: 7000,
        isClosable: true,
      })

      // Refresh status anyway to see current state
      await checkSBTStatus()
    } finally {
      setIsMintingSBT(false)
    }
  }

  const handleCreateProposal = async () => {
    if (!newProposalDescription.trim()) {
      toast({
        title: 'Description Required',
        description: 'Please enter a proposal description',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (!isValidAddress(STEALTH_GOV_ADDRESS)) {
      toast({
        title: 'Configuration Error',
        description: 'Contract address not configured',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    try {
      setIsCreating(true)

      console.log('📝 Creating proposal...')

      toast({
        title: 'Authenticating...',
        description: 'Please complete WebAuthn authentication',
        status: 'info',
        duration: 3000,
        isClosable: true,
      })

      // Import w3pk and derive wallet
      const { createWeb3Passkey } = await import('w3pk')

      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        stealthAddresses: {},
      })

      const walletInfo = await w3pk.deriveWallet(0)

      if (!walletInfo || !walletInfo.privateKey) {
        throw new Error('Failed to derive wallet')
      }

      console.log('Wallet derived:', walletInfo.address)

      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const wallet = new ethers.Wallet(walletInfo.privateKey, provider)

      // Create contract instance with signer
      const contract = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, wallet)

      toast({
        title: 'Creating Proposal...',
        description: 'Sending transaction to blockchain...',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      // Create proposal
      const tx = await contract.createProposal(newProposalDescription.trim())
      console.log('Transaction sent:', tx.hash)

      toast({
        title: 'Transaction Sent! ⏳',
        description: `Waiting for confirmation... TX: ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      await tx.wait()

      toast({
        title: 'Proposal Created! 🎉',
        description: 'Your proposal has been successfully created',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // Refresh proposals
      await fetchProposals()

      // Close modal and reset form
      onCreateClose()
      setNewProposalDescription('')
    } catch (error: any) {
      console.error('Error creating proposal:', error)

      let errorMessage = error.message || 'Failed to create proposal'

      if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance for transaction'
      } else if (error.message?.includes('User cancelled')) {
        errorMessage = 'Authentication cancelled'
      }

      toast({
        title: 'Proposal Creation Failed',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsCreating(false)
    }
  }

  const ensureStealthAuthorization = async () => {
    if (!user?.ethereumAddress) {
      throw new Error('User not authenticated')
    }

    try {
      console.log('📋 Checking stealth authorization...')
      
      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
      const contract = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, provider)

      // Check if authorization already exists
      const existingAuth = await contract.getStealthAuthorization(user.ethereumAddress)
      
      if (existingAuth && existingAuth.isActive) {
        console.log('✅ Stealth authorization already exists')
        return existingAuth.stealthMetaAddress
      }

      console.log('🔐 Creating stealth authorization...')

      // First check if user has an SBT token
      if (!hasSBT) {
        throw new Error('You must have an SBT token to create stealth authorization. Please mint an SBT first.')
      }

      console.log('✅ User has SBT, proceeding with authorization...')

      // Generate a deterministic meta address for this user
      // This will be the "root" meta address that all stealth addresses will derive from
      const userSeed = ethers.keccak256(
        ethers.solidityPacked(['address', 'string'], [user.ethereumAddress, 'stealth-meta'])
      )
      const stealthMetaAddress = ethers.getAddress('0x' + userSeed.slice(-40))

      console.log('Generated stealth meta address:', stealthMetaAddress)

      // Get wallet for signing authorization
      const { createWeb3Passkey } = await import('w3pk')
      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        stealthAddresses: {},
      })

      const walletInfo = await w3pk.deriveWallet(0)
      if (!walletInfo || !walletInfo.privateKey) {
        throw new Error('Failed to derive wallet for authorization')
      }

      const wallet = new ethers.Wallet(walletInfo.privateKey, provider)
      
      // Create authorization signature exactly as the contract expects
      const authMessage = ethers.keccak256(
        ethers.solidityPacked(
          ["string", "address", "string"],
          ["I authorize w3pk stealth address ", stealthMetaAddress, " to vote using my SBT tokens"]
        )
      )
      
      // Sign the message hash (contract will add ethereum signed message prefix)
      const authSignature = await wallet.signMessage(ethers.getBytes(authMessage))

      console.log('Authorization created for meta address:', stealthMetaAddress)
      console.log('Signed by:', wallet.address)

      // Call createStealthAuthorization on the contract
      const contractWithSigner = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, wallet)
      
      toast({
        title: 'Creating Authorization...',
        description: 'Linking your SBT to stealth voting capability',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      const authTx = await contractWithSigner.createStealthAuthorization(
        stealthMetaAddress,
        authSignature
      )

      console.log('Authorization transaction sent:', authTx.hash)

      toast({
        title: 'Authorization Sent! ⏳',
        description: `Creating stealth authorization... TX: ${authTx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      await authTx.wait()

      toast({
        title: 'Authorization Created! ✅',
        description: 'Stealth voting is now enabled for your account',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      console.log('✅ Stealth authorization created successfully')
      return stealthMetaAddress

    } catch (error: any) {
      console.error('Error creating stealth authorization:', error)
      
      if (error.message?.includes('AuthorizationAlreadyExists')) {
        console.log('Authorization already exists, continuing...')
        return null
      }
      
      throw new Error(`Failed to create stealth authorization: ${error.message}`)
    }
  }

  const handleVote = async (proposalId: number, support: number) => {
    if (!isAuthenticated) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to vote',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setIsVoting(true)

      console.log('🗳️ Casting vote...')

      // First, ensure stealth authorization exists and get the authorized meta address
      const authorizedMetaAddress = await ensureStealthAuthorization()
      
      if (!authorizedMetaAddress) {
        throw new Error('Failed to get authorized stealth meta address')
      }

      // Now generate a stealth address that will derive to our authorized meta address
      // The contract uses: keccak256(abi.encodePacked(stealthAddr, "meta"))
      // We need to find a stealth address where this derivation equals our authorized meta address
      
      let stealthAddress: string
      let stealthPrivateKey: string
      let attempts = 0
      const maxAttempts = 1000
      
      // Search for a stealth address that derives the correct meta address
      console.log('🔍 Searching for stealth address that maps to authorized meta address...')
      console.log('Target meta address:', authorizedMetaAddress)
      
      do {
        const randomSeed = ethers.randomBytes(32)
        const tempWallet = new ethers.Wallet(ethers.hexlify(randomSeed))
        const candidateAddress = tempWallet.address
        
        const derivedMetaAddress = ethers.getAddress(
          '0x' + ethers.keccak256(
            ethers.solidityPacked(['address', 'string'], [candidateAddress, 'meta'])
          ).slice(-40)
        )
        
        if (attempts % 100 === 0) {
          console.log(`Attempt ${attempts}: ${candidateAddress} -> ${derivedMetaAddress}`)
        }
        
        if (derivedMetaAddress.toLowerCase() === authorizedMetaAddress.toLowerCase()) {
          stealthAddress = candidateAddress
          stealthPrivateKey = ethers.hexlify(randomSeed)
          console.log('🎯 Found matching stealth address after', attempts + 1, 'attempts!')
          console.log('✅ Stealth address:', stealthAddress)
          console.log('✅ Derives to meta:', derivedMetaAddress)
          break
        }
        
        attempts++
      } while (attempts < maxAttempts)
      
      if (!stealthAddress) {
        console.log('❌ Could not find matching stealth address after', maxAttempts, 'attempts')
        console.log('🔄 Creating fresh stealth address and updating authorization...')
        
        // Generate a fresh stealth address for this vote
        const voteSeed = ethers.keccak256(
          ethers.solidityPacked(
            ['address', 'uint256', 'uint256', 'string'], 
            [user.ethereumAddress, proposalId, support, 'vote-stealth']
          )
        )
        const stealthWallet = new ethers.Wallet(voteSeed)
        stealthAddress = stealthWallet.address
        stealthPrivateKey = voteSeed
        
        // Calculate what meta address the contract will derive
        const contractDerivedMeta = ethers.getAddress(
          '0x' + ethers.keccak256(
            ethers.solidityPacked(['address', 'string'], [stealthAddress, 'meta'])
          ).slice(-40)
        )
        
        console.log('Generated stealth address:', stealthAddress)
        console.log('Contract will derive meta address:', contractDerivedMeta)
        console.log('Need to update authorization from:', authorizedMetaAddress)
        console.log('To:', contractDerivedMeta)
        
        // We need to update the authorization for this vote
        try {
          const { createWeb3Passkey } = await import('w3pk')
          const w3pk = createWeb3Passkey({
            apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
            stealthAddresses: {},
          })

          const walletInfo = await w3pk.deriveWallet(0)
          if (!walletInfo || !walletInfo.privateKey) {
            throw new Error('Failed to derive wallet for authorization update')
          }

          const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
          const wallet = new ethers.Wallet(walletInfo.privateKey, provider)
          const contract = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, wallet)
          
          toast({
            title: 'Updating Authorization... 🔄',
            description: 'Revoking old authorization and creating new one for this vote',
            status: 'info',
            duration: 5000,
            isClosable: true,
          })

          // Step 1: Revoke existing authorization
          console.log('🗑️ Revoking existing authorization...')
          const revokeTx = await contract.revokeStealthAuthorization()
          await revokeTx.wait()
          console.log('✅ Old authorization revoked')

          // Step 2: Create new authorization for the new meta address
          console.log('🆕 Creating new authorization...')
          const authMessage = ethers.keccak256(
            ethers.solidityPacked(
              ["string", "address", "string"],
              ["I authorize w3pk stealth address ", contractDerivedMeta, " to vote using my SBT tokens"]
            )
          )
          
          const authSignature = await wallet.signMessage(ethers.getBytes(authMessage))

          const createAuthTx = await contract.createStealthAuthorization(contractDerivedMeta, authSignature)
          await createAuthTx.wait()
          
          console.log('✅ New authorization created for meta address:', contractDerivedMeta)
          
          toast({
            title: 'Authorization Updated! ✅',
            description: 'Successfully updated stealth authorization for this vote',
            status: 'success',
            duration: 3000,
            isClosable: true,
          })
          
        } catch (authError) {
          console.error('Failed to update authorization:', authError)
          throw new Error(`Failed to update stealth authorization: ${authError.message}`)
        }
      }

      // Generate ephemeral public key using w3pk
      const { createWeb3Passkey } = await import('w3pk')
      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        stealthAddresses: {},
      })

      const w3pkStealthResult = await w3pk.stealth?.generateStealthAddress()
      if (!w3pkStealthResult) {
        throw new Error('Failed to generate ephemeral public key')
      }

      const stealthResult = {
        stealthAddress: stealthAddress!,
        stealthPrivateKey: stealthPrivateKey!,
        ephemeralPublicKey: w3pkStealthResult.ephemeralPublicKey
      }
      
      console.log('Final stealth address:', stealthResult.stealthAddress)
      console.log('Contract will derive meta address:', ethers.getAddress(
        '0x' + ethers.keccak256(
          ethers.solidityPacked(['address', 'string'], [stealthResult.stealthAddress, 'meta'])
        ).slice(-40)
      ))
      console.log('Our authorized meta address:', authorizedMetaAddress)

      const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)

      // Check if stealth address needs funding
      const stealthBalance = await provider.getBalance(stealthResult.stealthAddress)
      console.log('Stealth address balance:', ethers.formatEther(stealthBalance), 'ETH')

      // Fund stealth address if it has 0 balance
      if (stealthBalance === 0n) {
        console.log('💰 Stealth address has 0 ETH, triggering faucet...')
        
        try {
          const faucetResponse = await fetch('/api/faucet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ address: stealthResult.stealthAddress }),
          })
          
          if (faucetResponse.ok) {
            const faucetData = await faucetResponse.json()
            console.log('✅ Faucet sent to stealth address:', faucetData.txHash)
            toast({
              title: 'Funding Stealth Address... ⏳',
              description: `Faucet sent 0.001 ETH to stealth address for gas`,
              status: 'info',
              duration: 5000,
              isClosable: true,
            })
            
            // Wait for the faucet transaction to be confirmed
            console.log('⏳ Waiting for faucet transaction confirmation...')
            
            // Wait for the transaction to be mined
            const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
            
            try {
              const faucetTxReceipt = await provider.waitForTransaction(faucetData.txHash, 1, 30000) // Wait up to 30 seconds
              if (faucetTxReceipt) {
                console.log('✅ Faucet transaction confirmed:', faucetTxReceipt.hash)
                
                // Check balance again to confirm funding
                const newBalance = await provider.getBalance(stealthResult.stealthAddress)
                console.log('💰 New stealth address balance:', ethers.formatEther(newBalance), 'ETH')
                
                if (newBalance === 0n) {
                  throw new Error('Stealth address still has 0 balance after faucet')
                }
              } else {
                throw new Error('Faucet transaction not confirmed within timeout')
              }
            } catch (waitError) {
              console.error('Faucet confirmation failed:', waitError)
              // Continue anyway, but warn user
              toast({
                title: 'Faucet Warning ⚠️',
                description: 'Could not confirm faucet transaction. Vote may fail due to insufficient gas.',
                status: 'warning',
                duration: 5000,
                isClosable: true,
              })
            }
          } else {
            const errorData = await faucetResponse.json()
            throw new Error(`Faucet failed: ${errorData.error}`)
          }
        } catch (faucetError) {
          console.error('Faucet failed for stealth address:', faucetError)
          toast({
            title: 'Faucet Warning',
            description: 'Could not fund stealth address. Vote may fail due to insufficient gas.',
            status: 'warning',
            duration: 5000,
            isClosable: true,
          })
        }
      } else {
        console.log('✅ Stealth address already has ETH for gas')
      }

      // Create stealth wallet from w3pk generated stealth address
      const stealthWallet = new ethers.Wallet(stealthResult.stealthPrivateKey, provider)
      
      console.log('Stealth wallet created:', stealthWallet.address)
      console.log('Stealth wallet matches generated address:', 
        stealthWallet.address.toLowerCase() === stealthResult.stealthAddress.toLowerCase())

      const userSbtTokenId = sbtTokenId || 1

      // Create stealth proof signature exactly as contract expects
      console.log('📝 Creating stealth proof signature...')
      
      // This must match the contract's verification: keccak256(abi.encodePacked("Stealth ", stealthAddr, " votes with SBT ", sbtTokenId))
      const voteMessage = ethers.keccak256(
        ethers.solidityPacked(
          ['string', 'address', 'string', 'uint256'],
          ['Stealth ', stealthResult.stealthAddress, ' votes with SBT ', userSbtTokenId]
        )
      )
      
      // Sign with the stealth wallet's private key (contract will add ethereum signed message prefix)
      const stealthProof = await stealthWallet.signMessage(ethers.getBytes(voteMessage))

      console.log('Generated proof details:')
      console.log('- Stealth address:', stealthResult.stealthAddress)
      console.log('- Ephemeral pubkey:', stealthResult.ephemeralPublicKey)
      console.log('- Stealth proof length:', stealthProof.length, 'chars (', (stealthProof.length - 2) / 2, 'bytes)')
      console.log('- SBT Token ID:', userSbtTokenId)
      console.log('- Vote message hash:', voteMessage)

      toast({
        title: 'Casting Vote...',
        description: 'Sending anonymous vote to blockchain...',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      const contract = new ethers.Contract(STEALTH_GOV_ADDRESS, STEALTH_GOV_ABI, stealthWallet)

      toast({
        title: 'Casting Vote...',
        description: 'Sending anonymous vote to blockchain...',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      // Cast vote using w3pk ephemeral public key
      const tx = await contract.castStealthVote(
        proposalId,
        support,
        stealthResult.ephemeralPublicKey,
        stealthProof,
        userSbtTokenId
      )

      console.log('Vote transaction sent:', tx.hash)

      toast({
        title: 'Transaction Sent! ⏳',
        description: `Waiting for confirmation... TX: ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      await tx.wait()

      toast({
        title: 'Vote Cast Successfully! ✅',
        description: 'Your vote has been recorded anonymously',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      // Refresh proposals
      await fetchProposals()
    } catch (error: any) {
      console.error('Error voting:', error)

      let errorMessage = error.message || 'Failed to cast vote'

      if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance for transaction'
      } else if (error.message?.includes('already voted')) {
        errorMessage = 'You have already voted on this proposal'
      } else if (error.message?.includes('User cancelled')) {
        errorMessage = 'Authentication cancelled'
      }

      toast({
        title: 'Vote Failed',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsVoting(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const calculateProgress = (proposal: ProposalData) => {
    const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes
    if (total === 0) return { for: 0, against: 0, abstain: 0 }

    return {
      for: (proposal.forVotes / total) * 100,
      against: (proposal.againstVotes / total) * 100,
      abstain: (proposal.abstainVotes / total) * 100,
    }
  }

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Box textAlign="center">
          <Heading as="h1" size="xl" mb={4}>
            🎭 Stealth Voting
          </Heading>
          <Text color="gray.400" mb={2}>
            Coercion-Resistant DAO Governance with Private Voting
          </Text>
        </Box>

        {/* Info Alert */}
        {!isValidAddress(STEALTH_GOV_ADDRESS) ? (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>Contract Not Configured</AlertTitle>
              <AlertDescription fontSize="sm">
                Please set the contract address properly.
              </AlertDescription>
            </Box>
          </Alert>
        ) : (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>Privacy-Preserving Voting</AlertTitle>
              <AlertDescription fontSize="sm">
                Your votes are cast using stealth addresses, ensuring complete privacy and
                resistance to coercion. You can change your vote at any time during the voting
                period.
                {isAuthenticated && (
                  <Text mt={2} fontWeight="semibold" color="purple.300">
                    💡 Anyone can create proposals - get started by clicking the button below!
                  </Text>
                )}
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* SBT Status Alert */}
        {isAuthenticated && !hasSBT && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>SBT Required</AlertTitle>
              <AlertDescription fontSize="sm">
                You need a Soul Bound Token (SBT) to create proposals and vote. Mint your SBT to
                participate in governance.
              </AlertDescription>
            </Box>
            <Button
              colorScheme="orange"
              size="sm"
              onClick={handleMintSBT}
              isLoading={isMintingSBT}
              loadingText="Minting..."
              ml={4}
            >
              Mint SBT
            </Button>
          </Alert>
        )}

        {isAuthenticated && hasSBT && (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertDescription fontSize="sm">
                ✅ You have an SBT (Token ID: {sbtTokenId}) - You can create proposals and vote!
                <Text fontSize="xs" color="gray.300" mt={1}>
                  Wallet Balance: {parseFloat(ethBalance).toFixed(4)} ETH
                  {isFundingWallet && ' (Funding from faucet...)'}
                </Text>
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Create Proposal Button */}
        {isAuthenticated && hasSBT && (
          <Button leftIcon={<FiPlus />} colorScheme="purple" size="lg" onClick={onCreateOpen}>
            Create New Proposal
          </Button>
        )}

        {/* Proposals Section */}
        <Box>
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Active Proposals</Heading>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchProposals}
              isLoading={isLoadingProposals}
            >
              Refresh
            </Button>
          </Flex>

          {isLoadingProposals ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="xl" color="purple.500" />
            </Flex>
          ) : proposals.length === 0 ? (
            <Box textAlign="center" py={12} bg="gray.800" borderRadius="md">
              <Text color="gray.400" fontSize="lg" mb={2}>
                No proposals yet. {isAuthenticated ? 'Create the first one!' : 'Check back later.'}
              </Text>
              {isValidAddress(STEALTH_GOV_ADDRESS) && (
                <Text color="gray.500" fontSize="sm">
                  Connected to: {STEALTH_GOV_ADDRESS.slice(0, 6)}...
                  {STEALTH_GOV_ADDRESS.slice(-4)}
                </Text>
              )}
            </Box>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              {proposals.map(proposal => {
                const progress = calculateProgress(proposal)
                const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes

                return (
                  <Card
                    key={proposal.id}
                    bg="gray.800"
                    borderWidth="1px"
                    borderColor={proposal.isActive ? 'purple.500' : 'gray.700'}
                  >
                    <CardHeader>
                      <Flex justify="space-between" align="start">
                        <Box flex="1">
                          <Heading size="sm" mb={2}>
                            Proposal #{proposal.id}
                          </Heading>
                          <Badge colorScheme={proposal.isActive ? 'green' : 'gray'}>
                            {proposal.isActive ? 'Active' : 'Ended'}
                          </Badge>
                        </Box>
                        <Icon
                          as={FiClock}
                          color={proposal.isActive ? 'green.400' : 'gray.400'}
                          boxSize={5}
                        />
                      </Flex>
                    </CardHeader>

                    <CardBody>
                      <VStack spacing={4} align="stretch">
                        <Text fontSize="sm">{proposal.description}</Text>

                        <Divider />

                        <Box>
                          <Text fontSize="xs" color="gray.400" mb={1}>
                            Ends: {formatDate(proposal.endTime)}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            Total Votes: {totalVotes}
                          </Text>
                        </Box>

                        {/* Vote Distribution */}
                        <Box>
                          <Flex justify="space-between" mb={2}>
                            <Flex align="center" gap={2}>
                              <Icon as={FiCheckCircle} color="green.400" />
                              <Text fontSize="sm">For: {proposal.forVotes}</Text>
                            </Flex>
                            <Text fontSize="sm" color="gray.400">
                              {progress.for.toFixed(1)}%
                            </Text>
                          </Flex>
                          <Progress
                            value={progress.for}
                            colorScheme="green"
                            size="sm"
                            borderRadius="full"
                            mb={3}
                          />

                          <Flex justify="space-between" mb={2}>
                            <Flex align="center" gap={2}>
                              <Icon as={FiXCircle} color="red.400" />
                              <Text fontSize="sm">Against: {proposal.againstVotes}</Text>
                            </Flex>
                            <Text fontSize="sm" color="gray.400">
                              {progress.against.toFixed(1)}%
                            </Text>
                          </Flex>
                          <Progress
                            value={progress.against}
                            colorScheme="red"
                            size="sm"
                            borderRadius="full"
                            mb={3}
                          />

                          <Flex justify="space-between" mb={2}>
                            <Flex align="center" gap={2}>
                              <Icon as={FiMinusCircle} color="gray.400" />
                              <Text fontSize="sm">Abstain: {proposal.abstainVotes}</Text>
                            </Flex>
                            <Text fontSize="sm" color="gray.400">
                              {progress.abstain.toFixed(1)}%
                            </Text>
                          </Flex>
                          <Progress
                            value={progress.abstain}
                            colorScheme="gray"
                            size="sm"
                            borderRadius="full"
                          />
                        </Box>

                        {/* Vote Buttons */}
                        {proposal.isActive && isAuthenticated && hasSBT && (
                          <SimpleGrid columns={3} spacing={2}>
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleVote(proposal.id, 1)}
                              isLoading={isVoting}
                            >
                              For
                            </Button>
                            <Button
                              size="sm"
                              colorScheme="red"
                              onClick={() => handleVote(proposal.id, 0)}
                              isLoading={isVoting}
                            >
                              Against
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleVote(proposal.id, 2)}
                              isLoading={isVoting}
                            >
                              Abstain
                            </Button>
                          </SimpleGrid>
                        )}

                        {proposal.isActive && isAuthenticated && !hasSBT && (
                          <Alert status="warning" size="sm">
                            <AlertIcon />
                            <Box flex="1">
                              <Text fontSize="xs">Mint an SBT to vote</Text>
                            </Box>
                          </Alert>
                        )}

                        {!isAuthenticated && proposal.isActive && (
                          <Alert status="warning" size="sm">
                            <AlertIcon />
                            <Text fontSize="xs">Log in to vote</Text>
                          </Alert>
                        )}
                      </VStack>
                    </CardBody>
                  </Card>
                )
              })}
            </SimpleGrid>
          )}
        </Box>

        {/* Info Box */}
        <Box bg="gray.800" p={6} borderRadius="md">
          <Heading size="sm" mb={4}>
            How Stealth Voting Works
          </Heading>
          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="gray.300">
              🎭 <strong>Anonymous:</strong> Votes are cast using stealth addresses that cannot be
              linked to your identity
            </Text>
            <Text fontSize="sm" color="gray.300">
              🪙 <strong>SBT Required:</strong> You need a Soul Bound Token to participate - mint
              yours above!
            </Text>
            <Text fontSize="sm" color="gray.300">
              🔄 <strong>Change Your Vote:</strong> Modify your vote anytime during the voting
              period to resist coercion
            </Text>
            <Text fontSize="sm" color="gray.300">
              🛡️ <strong>Privacy-Preserving:</strong> Only you can see which stealth addresses
              belong to you
            </Text>
            <Text fontSize="sm" color="gray.300">
              ✅ <strong>Verifiable:</strong> All votes are recorded on-chain for transparency
            </Text>
          </VStack>
        </Box>
      </VStack>

      {/* Create Proposal Modal */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader>Create New Proposal</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Alert status="info" size="sm">
                <AlertIcon />
                <Text fontSize="xs">
                  Anyone can create proposals! Your proposal will be active for 7 days.
                </Text>
              </Alert>
              <FormControl>
                <FormLabel>Proposal Description</FormLabel>
                <Textarea
                  value={newProposalDescription}
                  onChange={e => setNewProposalDescription(e.target.value)}
                  placeholder="Describe your proposal in detail..."
                  minH="150px"
                  bg="gray.700"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onCreateClose}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleCreateProposal}
              isLoading={isCreating}
              loadingText="Creating..."
            >
              Create Proposal
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  )
}
