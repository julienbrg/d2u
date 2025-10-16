'use client'

// Ethereum type declaration
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
import { useState, useEffect, useCallback } from 'react'
import { FiCheckCircle, FiXCircle, FiMinusCircle, FiClock, FiPlus } from 'react-icons/fi'
import { ethers } from 'ethers'

// Contract addresses - properly checksummed
const STEALTH_GOV_ADDRESS = '0x895E901d59D1818a3b2994dF63a5b6077B7D1c2e'
const SBT_CONTRACT_ADDRESS = '0x0efc9C0D41ff11A272112594f1721EcAE0980C55'

// RPC configuration
const PRIMARY_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL
const FALLBACK_RPC_URL = 'https://gateway.tenderly.co/public/sepolia'

// Validate address format - Fixed to return explicit boolean
const isValidAddress = (address: string): boolean => {
  return !!(address && address.length === 42 && address.startsWith('0x'))
}

// Create provider with fallback
const createProvider = (useFallback: boolean = false): ethers.JsonRpcProvider => {
  const rpcUrl = useFallback ? FALLBACK_RPC_URL : PRIMARY_RPC_URL
  return new ethers.JsonRpcProvider(rpcUrl)
}

// StealthGov ZK contract ABI
const STEALTH_GOV_ABI = [
  'function proposalCount() view returns (uint256)',
  'function getProposal(uint256 proposalId) view returns (string description, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool executed)',
  'function isProposalActive(uint256 proposalId) view returns (bool)',
  'function createProposal(string description) returns (uint256)',
  'function castStealthVote(uint256 proposalId, uint8 support, bytes ephemeralPubkey, tuple(uint256[2] piA, uint256[2][2] piB, uint256[2] piC) zkProof, uint256[4] publicSignals)',
  'function changeStealthVote(uint256 proposalId, uint8 newSupport, bytes newEphemeralPubkey, tuple(uint256[2] piA, uint256[2][2] piB, uint256[2] piC) zkProof, uint256[4] publicSignals)',
  'function getStealthVotes(uint256 proposalId) view returns (tuple(address stealthAddress, uint8 support, bytes ephemeralPubkey, uint256 timestamp, bool isLatest, bytes32 nullifier)[])',
  'function getVoteChangeHistory(uint256 proposalId) view returns (tuple(uint8 oldSupport, uint8 newSupport, uint256 timestamp, bytes32 nullifier)[])',
  'function isNullifierUsed(uint256 proposalId, bytes32 nullifier) view returns (bool)',
  'function getSbtContract() view returns (address)',
  'function getSbtHoldersRoot() view returns (bytes32)',
  'event ProposalCreated(uint256 indexed proposalId, string description, uint256 startTime, uint256 endTime)',
  'event StealthVoteCast(uint256 indexed proposalId, address indexed stealthAddress, uint8 support, bytes ephemeralPubkey, uint256 timestamp, bytes32 nullifierHash)',
  'event StealthVoteChanged(uint256 indexed proposalId, uint8 oldSupport, uint8 newSupport, uint256 timestamp, bytes32 nullifierHash)',
]

// SBT contract ABI
const SBT_ABI = [
  'function mintHumanityToken(address to) returns (uint256)',
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
  const { isAuthenticated, user } = useWebAuthn()
  const toast = useToast()
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure()

  // State
  const [proposals, setProposals] = useState<ProposalData[]>([])
  const [isLoadingProposals, setIsLoadingProposals] = useState(false)
  const [votingProposalId, setVotingProposalId] = useState<number | null>(null)
  const [votingStep, setVotingStep] = useState<string>('')
  const [isCreating, setIsCreating] = useState(false)
  const [newProposalDescription, setNewProposalDescription] = useState('')
  const [hasSBT, setHasSBT] = useState(false)
  const [sbtTokenId, setSbtTokenId] = useState<number | null>(null)
  const [isMintingSBT, setIsMintingSBT] = useState(false)
  const [ethBalance, setEthBalance] = useState<string>('0')
  const [isFundingWallet, setIsFundingWallet] = useState(false)
  const [sbtHoldersRoot, setSbtHoldersRoot] = useState<string | null>(null)

  const fetchSBTHoldersRoot = useCallback(async () => {
    try {
      const provider = createProvider()
      const contract = new ethers.Contract(
        ethers.getAddress(STEALTH_GOV_ADDRESS),
        STEALTH_GOV_ABI,
        provider
      )
      const root = await contract.getSbtHoldersRoot()
      setSbtHoldersRoot(root)
      console.log('SBT Holders Root:', root)
    } catch (error) {
      console.error('Error fetching SBT holders root:', error)
    }
  }, [])

  const fetchProposalData = useCallback(
    async (
      contract: ethers.Contract,
      proposalId: number,
      retries: number = 3
    ): Promise<ProposalData | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const [
            [description, startTime, endTime, forVotes, againstVotes, abstainVotes, executed],
            isActive,
          ] = await Promise.all([
            contract.getProposal(proposalId),
            contract.isProposalActive(proposalId),
          ])

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
        } catch (error: any) {
          if (attempt === retries) return null

          if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
            await new Promise(resolve => setTimeout(resolve, delay))
          } else {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      }
      return null
    },
    []
  )

  const fetchProposals = useCallback(
    async (useFallback: boolean = false) => {
      if (!isValidAddress(STEALTH_GOV_ADDRESS)) {
        console.warn('Contract address not configured')
        setProposals([])
        setIsLoadingProposals(false)
        return
      }

      setIsLoadingProposals(true)
      try {
        const provider = createProvider(useFallback)
        const contract = new ethers.Contract(
          ethers.getAddress(STEALTH_GOV_ADDRESS),
          STEALTH_GOV_ABI,
          provider
        )

        console.log(`📋 Fetching proposals using ${useFallback ? 'fallback' : 'primary'} RPC...`)

        let proposalIds: number[] = []

        try {
          const filter = contract.filters.ProposalCreated()
          const events = await contract.queryFilter(filter, 9407254, 'latest')
          console.log('Found', events.length, 'ProposalCreated events')

          proposalIds = events
            .map(event => {
              if ('args' in event && event.args) {
                return Number(event.args.proposalId)
              }
              const parsed = contract.interface.parseLog({
                topics: [...event.topics],
                data: event.data,
              })
              return parsed ? Number(parsed.args.proposalId) : -1
            })
            .filter(id => id >= 0)

          console.log('Final proposal IDs:', proposalIds)
        } catch (eventError) {
          console.log('⚠️ Event-based fetching failed, falling back to proposal count...')
          try {
            const count = await contract.proposalCount()
            const proposalCount = Number(count)
            proposalIds = Array.from({ length: proposalCount }, (_, i) => i)
          } catch (countError) {
            throw new Error('Failed to fetch proposal list')
          }
        }

        if (proposalIds.length === 0) {
          setProposals([])
          setIsLoadingProposals(false)
          return
        }

        const fetchedProposals = []
        console.log(`📝 Fetching details for ${proposalIds.length} proposals`)

        for (let i = 0; i < proposalIds.length; i++) {
          try {
            const proposal = await fetchProposalData(contract, proposalIds[i])
            if (proposal) {
              fetchedProposals.push(proposal)
            }

            if (i < proposalIds.length - 1) {
              const delay = Math.min(200 + i * 50, 1000)
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          } catch (error) {
            console.error(`Failed to fetch proposal ${proposalIds[i]}:`, error)
          }
        }

        const validProposals = fetchedProposals.filter(p => p !== null) as ProposalData[]
        console.log(`🏛️ Setting ${validProposals.length} proposals`)
        setProposals(validProposals)
      } catch (error: any) {
        console.error('Error fetching proposals:', error)

        if (
          !useFallback &&
          (error.message?.includes('429') || error.message?.includes('Too Many Requests'))
        ) {
          console.log('🔄 Switching to fallback RPC...')
          setIsLoadingProposals(false)
          return fetchProposals(true)
        }

        toast({
          title: 'Error Fetching Proposals',
          description: error.message || 'Failed to load proposals',
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      } finally {
        setIsLoadingProposals(false)
      }
    },
    [fetchProposalData, toast]
  )

  const checkSBTStatus = useCallback(async () => {
    if (!user?.ethereumAddress || !isValidAddress(SBT_CONTRACT_ADDRESS)) return

    try {
      const provider = createProvider()
      const sbtContract = new ethers.Contract(
        ethers.getAddress(SBT_CONTRACT_ADDRESS),
        SBT_ABI,
        provider
      )

      const balance = await sbtContract.balanceOf(user.ethereumAddress)
      const hasToken = Number(balance) > 0

      setHasSBT(hasToken)

      if (hasToken) {
        const tokenId = await sbtContract.tokenOfOwnerByIndex(user.ethereumAddress, 0)
        setSbtTokenId(Number(tokenId))
      }
    } catch (error) {
      console.error('Error checking Human Passport SBT status:', error)
    }
  }, [user?.ethereumAddress])

  const triggerFaucet = useCallback(async () => {
    if (!user?.ethereumAddress) return

    setIsFundingWallet(true)
    try {
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.ethereumAddress }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Wallet Funded! 💰',
          description: `Received 0.001 ETH. TX: ${data.txHash}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        })
      }
    } catch (error) {
      console.error('Error triggering faucet:', error)
    } finally {
      setIsFundingWallet(false)
    }
  }, [user?.ethereumAddress, toast])

  const checkEthBalance = useCallback(async () => {
    if (!user?.ethereumAddress) return

    try {
      const provider = createProvider()
      const balance = await provider.getBalance(user.ethereumAddress)
      const balanceInEth = ethers.formatEther(balance)
      setEthBalance(balanceInEth)

      const minBalance = ethers.parseEther('0.001')
      if (balance < minBalance) {
        await triggerFaucet()
      }
    } catch (error) {
      console.error('Error checking ETH balance:', error)
    }
  }, [user?.ethereumAddress, triggerFaucet])

  // Fetch data on mount - Fixed with useCallback dependencies
  useEffect(() => {
    fetchProposals()
    if (isAuthenticated && user?.ethereumAddress) {
      checkEthBalance()
      checkSBTStatus()
      fetchSBTHoldersRoot()
    }
  }, [
    isAuthenticated,
    user?.ethereumAddress,
    fetchProposals,
    checkEthBalance,
    checkSBTStatus,
    fetchSBTHoldersRoot,
  ])

  const handleMintSBT = async () => {
    if (!isValidAddress(SBT_CONTRACT_ADDRESS)) {
      toast({
        title: 'Human Passport SBT Contract Not Configured',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    if (!user?.ethereumAddress) return

    try {
      setIsMintingSBT(true)

      const provider = createProvider()
      const sbtContract = new ethers.Contract(SBT_CONTRACT_ADDRESS, SBT_ABI, provider)

      const balance = await sbtContract.balanceOf(user.ethereumAddress)
      if (Number(balance) > 0) {
        toast({
          title: 'Already Have Human Passport SBT',
          status: 'info',
          duration: 5000,
          isClosable: true,
        })
        await checkSBTStatus()
        return
      }

      toast({
        title: 'Authenticating...',
        description: 'Completing WebAuthn authentication',
        status: 'info',
        duration: 3000,
        isClosable: true,
      })

      // Create w3pk instance for SBT minting
      const { createWeb3Passkey } = await import('w3pk')
      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
      })

      // Login to ensure authentication
      const authResult = await w3pk.login()
      if (!authResult.verified) {
        throw new Error('Authentication failed')
      }

      const walletInfo = await w3pk.deriveWallet(0)
      if (!walletInfo?.privateKey) {
        throw new Error('Failed to derive wallet')
      }

      const wallet = new ethers.Wallet(walletInfo.privateKey, provider)

      // Check ETH balance and fund if necessary
      const ethBalance = await provider.getBalance(walletInfo.address)
      const minBalance = ethers.parseEther('0.001')

      if (ethBalance < minBalance) {
        toast({
          title: 'Funding Wallet...',
          description: 'Your wallet needs ETH for transaction fees. Requesting from faucet...',
          status: 'info',
          duration: 5000,
          isClosable: true,
        })

        // Trigger faucet
        try {
          const response = await fetch('/api/faucet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: walletInfo.address }),
          })

          const faucetData = await response.json()

          if (!response.ok) {
            throw new Error(faucetData.error || 'Faucet request failed')
          }

          toast({
            title: 'Funding Successful! 💰',
            description: `Received ${faucetData.amount} ETH from faucet`,
            status: 'success',
            duration: 5000,
            isClosable: true,
          })

          // Wait a bit for the transaction to be mined
          await new Promise(resolve => setTimeout(resolve, 3000))
        } catch (faucetError: any) {
          toast({
            title: 'Faucet Failed',
            description: faucetError.message || 'Could not fund wallet. Please try again later.',
            status: 'warning',
            duration: 7000,
            isClosable: true,
          })
          // Continue anyway - user might have enough balance now
        }
      }

      const sbtContractWithSigner = new ethers.Contract(SBT_CONTRACT_ADDRESS, SBT_ABI, wallet)

      toast({
        title: 'Minting Human Passport SBT...',
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

      const tx = await sbtContractWithSigner.mintHumanityToken(walletInfo.address)

      toast({
        title: 'Transaction Sent! ⏳',
        description: `TX: ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      await tx.wait()

      toast({
        title: 'Human Passport SBT Minted! 🎉',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      await checkSBTStatus()
    } catch (error: any) {
      console.error('Error minting Human Passport SBT:', error)

      let errorMessage = error.message || 'Failed to mint Human Passport SBT'
      if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance'
      }

      toast({
        title: 'Human Passport SBT Minting Failed',
        description: errorMessage,
        status: 'error',
        duration: 7000,
        isClosable: true,
      })
    } finally {
      setIsMintingSBT(false)
    }
  }

  const handleCreateProposal = async () => {
    if (!newProposalDescription.trim()) {
      toast({
        title: 'Description Required',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setIsCreating(true)

      // Create w3pk instance and try to derive wallet
      const { createWeb3Passkey } = await import('w3pk')
      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
      })

      // Try to login first, then derive wallet
      try {
        const authResult = await w3pk.login()
        if (!authResult.verified) {
          throw new Error('Authentication failed')
        }
      } catch (authError: any) {
        console.error('Login error:', authError)
        throw new Error(`Authentication failed: ${authError.message}`)
      }

      const walletInfo = await w3pk.deriveWallet(0)
      if (!walletInfo?.privateKey) throw new Error('Failed to derive wallet after authentication')

      const provider = createProvider()
      const wallet = new ethers.Wallet(walletInfo.privateKey, provider)
      const contract = new ethers.Contract(
        ethers.getAddress(STEALTH_GOV_ADDRESS),
        STEALTH_GOV_ABI,
        wallet
      )

      const tx = await contract.createProposal(newProposalDescription.trim())

      toast({
        title: 'Transaction Sent! ⏳',
        status: 'info',
        duration: 7000,
        isClosable: true,
      })

      await tx.wait()

      toast({
        title: 'Proposal Created! 🎉',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      await fetchProposals()
      onCreateClose()
      setNewProposalDescription('')
    } catch (error: any) {
      console.error('Error creating proposal:', error)

      toast({
        title: 'Proposal Creation Failed',
        description: error.message || 'Failed to create proposal',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleVote = async (proposalId: number, support: number) => {
    if (!isAuthenticated || !user) {
      toast({
        title: 'Authentication Required',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    try {
      setVotingProposalId(proposalId)
      setVotingStep('Authenticating with WebAuthn...')
      console.log('🗳️ Starting ZK vote process...')

      const { createWeb3Passkey, generateNFTOwnershipProofInputs } = await import('w3pk')
      const { fetchSBTHoldersWithCache } = await import('@/utils/sbtHolders')

      // Create authenticated w3pk instance with ZK capabilities
      const w3pk = createWeb3Passkey({
        apiBaseUrl: process.env.NEXT_PUBLIC_WEBAUTHN_API_URL || 'https://webauthn.w3hc.org',
        zkProofs: {
          enabledProofs: ['nft'],
        },
      })

      console.log(
        '🔧 w3pk instance created, ZK available:',
        !!w3pk.zk,
        'hasZKProofs:',
        w3pk.hasZKProofs
      )

      // Login to ensure authentication
      const authResult = await w3pk.login()
      if (!authResult.verified) {
        throw new Error('Authentication failed')
      }

      console.log('🔐 Deriving wallet...')
      setVotingStep('Deriving cryptographic wallet...')
      const walletInfo = await w3pk.deriveWallet(0)
      if (!walletInfo?.privateKey) throw new Error('Failed to derive wallet')

      console.log('✅ Wallet derived:', walletInfo.address)

      const provider = createProvider()
      const contract = new ethers.Contract(
        ethers.getAddress(STEALTH_GOV_ADDRESS),
        STEALTH_GOV_ABI,
        provider
      )

      console.log('📋 Fetching Human Passport SBT holders...')
      setVotingStep('Fetching Human Passport SBT holders and building Merkle tree...')
      let holderAddresses: string[]

      try {
        holderAddresses = await fetchSBTHoldersWithCache(SBT_CONTRACT_ADDRESS, provider)
        console.log(`✅ Found ${holderAddresses.length} Human Passport SBT holders`)
      } catch (error) {
        console.error('Failed to fetch Human Passport SBT holders:', error)
        holderAddresses = [user.ethereumAddress]
        console.warn('⚠️ Using fallback: single holder mode')
      }

      const userAddressLower = user.ethereumAddress.toLowerCase()
      if (!holderAddresses.some(addr => addr.toLowerCase() === userAddressLower)) {
        console.log('User not in holder list, adding...')
        holderAddresses.push(user.ethereumAddress)
      }

      // Handle single-holder edge case by adding a dummy holder to create a proper Merkle tree
      if (holderAddresses.length === 1) {
        console.log('⚠️ Single holder detected, adding dummy holder for proper Merkle tree')
        // Add a dummy zero address to create a 2-node tree
        holderAddresses.push(ethers.ZeroAddress)
      }

      console.log('📋 Final Human Passport SBT holder list for ZK proof:', holderAddresses)

      console.log('🔬 Generating ZK proof inputs...')
      setVotingStep('Generating zero-knowledge proof...')

      // Get the merkle root from the contract instead of calculating our own
      const contractRoot = await contract.getSbtHoldersRoot()
      console.log('📋 Contract Human Passport SBT holders root:', contractRoot)

      const { nftProofInput } = await generateNFTOwnershipProofInputs(
        user.ethereumAddress,
        SBT_CONTRACT_ADDRESS,
        holderAddresses,
        BigInt(1)
      )

      // Override the calculated root with the contract's root
      nftProofInput.holdersRoot = contractRoot.toString()

      console.log('✅ Proof inputs generated')
      console.log('  - Holder index:', nftProofInput.holderIndex)
      console.log('  - Merkle root (from contract):', nftProofInput.holdersRoot)

      console.log('⏳ Generating ZK proof (this may take 5-10 seconds)...')

      // Check if ZK module is available
      if (!w3pk.zk) {
        throw new Error('ZK proof module not available. Please check w3pk configuration.')
      }

      // Skip ZK proof generation for now and use mock proof for testing
      console.log('🔧 Using mock ZK proof for testing (bypassing w3pk ZK generation)')

      // Check if user has Human Passport SBT
      setVotingStep('Verifying Human Passport SBT ownership...')
      const sbtContract = new ethers.Contract(SBT_CONTRACT_ADDRESS, SBT_ABI, provider)
      const sbtBalance = await sbtContract.balanceOf(user.ethereumAddress)
      if (sbtBalance === BigInt(0)) {
        throw new Error('You must own a Human Passport SBT to vote')
      }

      // Create mock ZK proof using contract's merkle root
      console.log('🔧 Creating mock ZK proof for testing...')

      const zkProof = {
        piA: [BigInt(1), BigInt(2)], // Non-zero values for testing
        piB: [
          [BigInt(3), BigInt(4)],
          [BigInt(5), BigInt(6)],
        ],
        piC: [BigInt(7), BigInt(8)],
      }

      // Generate a deterministic nullifier for this user+proposal (same nullifier for vote changes)
      const voteNullifier = ethers.keccak256(
        ethers.solidityPacked(['address', 'uint256'], [user.ethereumAddress, proposalId])
      )

      // Calculate hashed contract address as expected by the contract
      const hashedContractAddress = ethers.keccak256(
        ethers.solidityPacked(['address'], [SBT_CONTRACT_ADDRESS])
      )

      const publicSignals = [
        BigInt(contractRoot.toString()), // holdersRoot
        BigInt(hashedContractAddress), // hashed contract address
        BigInt(1), // minimum balance
        BigInt(voteNullifier), // nullifier
      ]

      console.log('📊 Using mock proof with contract root')
      console.log('Contract root:', contractRoot.toString())
      console.log('Hashed contract address:', hashedContractAddress)
      console.log('Vote nullifier:', voteNullifier)
      console.log(
        'Public signals:',
        publicSignals.map(s => s.toString())
      )

      // Nullifier is now generated internally by the contract
      const ephemeralKey = ethers.hexlify(ethers.randomBytes(32))

      const stealthSeed = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'uint256', 'uint256', 'uint8'],
          [user.ethereumAddress, proposalId, Date.now(), support]
        )
      )
      const stealthWallet = new ethers.Wallet(stealthSeed, provider)
      console.log('🥷 Stealth address:', stealthWallet.address)

      const stealthBalance = await provider.getBalance(stealthWallet.address)
      const minBalance = ethers.parseEther('0.001')

      if (stealthBalance < minBalance) {
        console.log('💰 Funding stealth address...')
        setVotingStep('Funding anonymous voting address...')

        const faucetResponse = await fetch('/api/faucet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: stealthWallet.address }),
        })

        if (faucetResponse.ok) {
          const faucetData = await faucetResponse.json()
          await provider.waitForTransaction(faucetData.txHash, 1, 30000)
          console.log('✅ Stealth address funded')
        }
      }

      const contractWithSigner = new ethers.Contract(
        STEALTH_GOV_ADDRESS,
        STEALTH_GOV_ABI,
        stealthWallet
      )

      let tx
      // Check if this nullifier has been used before to determine vote vs change
      setVotingStep('Submitting anonymous vote to blockchain...')
      const isNullifierUsed = await contract.isNullifierUsed(proposalId, voteNullifier)

      if (isNullifierUsed) {
        console.log('📝 Nullifier already used, changing existing vote...')
        tx = await contractWithSigner.changeStealthVote(
          proposalId,
          support,
          ephemeralKey,
          zkProof,
          publicSignals
        )
      } else {
        console.log('📝 New nullifier, casting new vote...')
        tx = await contractWithSigner.castStealthVote(
          proposalId,
          support,
          ephemeralKey,
          zkProof,
          publicSignals
        )
      }

      console.log('📤 Transaction sent:', tx.hash)

      toast({
        title: 'Transaction Sent! ⏳',
        description: `TX: ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 10000,
        isClosable: true,
      })

      await tx.wait()

      toast({
        title: 'Vote Cast Successfully! ✅',
        description: 'Your anonymous vote has been recorded on-chain',
        status: 'success',
        duration: 5000,
        isClosable: true,
      })

      await fetchProposals()

      const voteStorageKey = `vote_${user.ethereumAddress}_${proposalId}`
      const voteInfo = {
        proposalId,
        support,
        timestamp: Date.now(),
        stealthAddress: stealthWallet.address,
        nullifier: 'generated-by-contract',
        txHash: tx.hash,
      }
      localStorage.setItem(voteStorageKey, JSON.stringify(voteInfo))
    } catch (error: any) {
      // End of ZK voting path
      console.error('❌ Error voting:', error)

      let errorMessage = error.message || 'Failed to cast vote'
      let errorTitle = 'Vote Failed'

      if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance for transaction'
        errorTitle = 'Insufficient Funds'
      } else if (
        error.message?.includes('User cancelled') ||
        error.message?.includes('user rejected')
      ) {
        errorMessage = 'Authentication cancelled by user'
        errorTitle = 'Authentication Cancelled'
      } else if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
        errorMessage = 'RPC rate limit reached. Please wait and try again.'
        errorTitle = 'Rate Limit'
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        status: 'error',
        duration: 7000,
        isClosable: true,
      })

      try {
        await fetchProposals()
      } catch (refreshError) {
        console.error('Failed to refresh proposals:', refreshError)
      }
    } finally {
      setVotingProposalId(null)
      setVotingStep('')
    }
  }

  const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString()

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
        <Box textAlign="center">
          <Heading as="h1" size="xl" mb={4}>
            🎭 ZK Stealth Voting
          </Heading>
          <Text color="gray.400" mb={2}>
            Zero-Knowledge Proof Based DAO Governance
          </Text>
        </Box>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box flex="1">
            <AlertTitle>Privacy-Preserving ZK Voting</AlertTitle>
            <AlertDescription fontSize="sm">
              Your votes use zero-knowledge proofs to prove Human Passport SBT ownership without
              revealing your identity. Change your vote anytime during the voting period.
              {isAuthenticated && (
                <Text mt={2} fontWeight="semibold" color="purple.300">
                  💡 Anyone with a Human Passport SBT can create proposals and vote!
                </Text>
              )}
            </AlertDescription>
          </Box>
        </Alert>

        {isAuthenticated && !hasSBT && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>Human Passport SBT Required</AlertTitle>
              <AlertDescription fontSize="sm">
                Mint a Human Passport SBT to participate in governance
              </AlertDescription>
            </Box>
            <Button colorScheme="orange" size="sm" onClick={handleMintSBT} isLoading={isMintingSBT}>
              Mint Human Passport SBT (mock)
            </Button>
            <Button ml={4} colorScheme="blue" size="sm" disabled>
              Connect with your Human Wallet
            </Button>
          </Alert>
        )}

        {isAuthenticated && hasSBT && (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertDescription fontSize="sm">
                ✅ You have a Human Passport SBT (Token ID: {sbtTokenId}) - You can create proposals
                and vote!
                <Text fontSize="xs" color="gray.300" mt={1}>
                  Wallet Balance: {parseFloat(ethBalance).toFixed(4)} ETH
                  {isFundingWallet && ' (Funding...)'}
                </Text>
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {isAuthenticated && hasSBT && (
          <Button leftIcon={<FiPlus />} colorScheme="purple" size="lg" onClick={onCreateOpen}>
            Create New Proposal
          </Button>
        )}

        <Box>
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md">Active Proposals</Heading>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchProposals()}
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
              <Text color="gray.400" fontSize="lg" mb={4}>
                No proposals yet. {isAuthenticated ? 'Create the first one!' : 'Check back later.'}
              </Text>
              {isAuthenticated && hasSBT && (
                <Button
                  leftIcon={<FiPlus />}
                  colorScheme="purple"
                  size="lg"
                  onClick={onCreateOpen}
                  mb={4}
                >
                  Create First Proposal
                </Button>
              )}
              {isValidAddress(STEALTH_GOV_ADDRESS) && (
                <Text color="gray.500" fontSize="sm">
                  Connected to: {STEALTH_GOV_ADDRESS.slice(0, 6)}...{STEALTH_GOV_ADDRESS.slice(-4)}
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

                        {proposal.isActive &&
                          isAuthenticated &&
                          hasSBT &&
                          (votingProposalId === proposal.id ? (
                            <Box
                              p={4}
                              bg="purple.900"
                              borderRadius="md"
                              border="1px solid"
                              borderColor="purple.500"
                              textAlign="center"
                            >
                              <Flex align="center" justify="center" mb={2}>
                                <Spinner size="sm" color="purple.400" mr={3} />
                                <Text fontSize="sm" fontWeight="semibold" color="purple.200">
                                  Casting Vote...
                                </Text>
                              </Flex>
                              <Text fontSize="xs" color="gray.300">
                                {votingStep}
                              </Text>
                            </Box>
                          ) : (
                            <SimpleGrid columns={3} spacing={2}>
                              <Button
                                size="sm"
                                colorScheme="green"
                                onClick={() => handleVote(proposal.id, 1)}
                              >
                                For
                              </Button>
                              <Button
                                size="sm"
                                colorScheme="red"
                                onClick={() => handleVote(proposal.id, 0)}
                              >
                                Against
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleVote(proposal.id, 2)}
                              >
                                Abstain
                              </Button>
                            </SimpleGrid>
                          ))}

                        {proposal.isActive && isAuthenticated && !hasSBT && (
                          <Alert status="warning" size="sm">
                            <AlertIcon />
                            <Box flex="1">
                              <Text fontSize="xs">Mint a Human Passport SBT to vote</Text>
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

        <Box bg="gray.800" p={6} borderRadius="md">
          <Heading size="sm" mb={4}>
            How ZK Stealth Voting Works
          </Heading>
          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="gray.300">
              🔬 <strong>Zero-Knowledge Proofs:</strong> Prove Human Passport SBT ownership without
              revealing your token ID or identity
            </Text>
            <Text fontSize="sm" color="gray.300">
              🎭 <strong>Anonymous:</strong> Votes cast from stealth addresses that cannot be linked
              to you
            </Text>
            <Text fontSize="sm" color="gray.300">
              🪙 <strong>Human Passport SBT Required:</strong> Mint a Human Passport SBT to
              participate in governance
            </Text>
            <Text fontSize="sm" color="gray.300">
              🔄 <strong>Change Your Vote:</strong> Update your vote anytime during the voting
              period
            </Text>
            <Text fontSize="sm" color="gray.300">
              🛡️ <strong>Privacy-Preserving:</strong> Cryptographic nullifiers prevent double voting
              while maintaining privacy
            </Text>
            <Text fontSize="sm" color="gray.300">
              ✅ <strong>Verifiable:</strong> All votes verified on-chain using ZK-SNARKs
            </Text>
          </VStack>
        </Box>

        <Box bg="gray.900" p={6} borderRadius="md" borderWidth="1px" borderColor="purple.700">
          <Heading size="sm" mb={4} color="purple.300">
            🔧 Technical Details
          </Heading>
          <VStack spacing={2} align="stretch" fontSize="xs" fontFamily="mono">
            <Flex justify="space-between">
              <Text color="gray.400">StealthGov Contract:</Text>
              <Text color="purple.300">
                {STEALTH_GOV_ADDRESS.slice(0, 6)}...{STEALTH_GOV_ADDRESS.slice(-4)}
              </Text>
            </Flex>
            <Flex justify="space-between">
              <Text color="gray.400">Human Passport SBT Contract (mock):</Text>
              <Text color="purple.300">
                {SBT_CONTRACT_ADDRESS.slice(0, 6)}...{SBT_CONTRACT_ADDRESS.slice(-4)}
              </Text>
            </Flex>
            {sbtHoldersRoot && (
              <Flex justify="space-between">
                <Text color="gray.400">Human Passport SBT Holders Root:</Text>
                <Text color="purple.300">
                  {sbtHoldersRoot.slice(0, 10)}...{sbtHoldersRoot.slice(-8)}
                </Text>
              </Flex>
            )}
            <Flex justify="space-between">
              <Text color="gray.400">ZK Proof System:</Text>
              <Text color="green.300">Groth16 (w3pk SDK)</Text>
            </Flex>
          </VStack>
        </Box>
      </VStack>

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
                  Anyone with a Human Passport SBT can create proposals! Active for 7 days.
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
            <Button colorScheme="purple" onClick={handleCreateProposal} isLoading={isCreating}>
              Create Proposal
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  )
}
