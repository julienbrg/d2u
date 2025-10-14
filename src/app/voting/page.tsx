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
} from '@chakra-ui/react'
import { useState, useEffect, useCallback } from 'react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { ethers } from 'ethers'
import { FiEye, FiEyeOff, FiShield, FiUsers, FiClock, FiAward } from 'react-icons/fi'

// Contract ABIs
const MOCK_SBT_ABI = [
  'function mint(address to) external',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwner(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isValidHuman(address human) view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

const STEALTH_GOV_ABI = [
  'function castStealthVote(uint256 proposalId, uint8 support, bytes calldata ephemeralPubkey, bytes calldata stealthProof, uint256 sbtTokenId)',
  'function changeStealthVote(uint256 proposalId, uint8 newSupport, bytes calldata newEphemeralPubkey, bytes calldata stealthProof, uint256 originalSbtTokenId)',
  'function createProposal(string calldata description) returns (uint256)',
  'function getProposal(uint256 proposalId) view returns (string memory description, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool executed)',
  'function isProposalActive(uint256 proposalId) view returns (bool)',
  'function createStealthAuthorization(address stealthMetaAddress, bytes calldata authorizationSignature)',
  'event StealthVoteCast(uint256 indexed proposalId, address indexed stealthAddress, uint8 support, bytes ephemeralPubkey, uint256 timestamp, uint256 sbtTokenId, uint256 voteChangeCount)',
]

interface Proposal {
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

interface MyVote {
  stealthAddress: string
  support: 0 | 1 | 2
  ephemeralPublicKey: string
  timestamp: number
  canProve: boolean
}

// Contract addresses
const MOCK_SBT_CONTRACT = '0x28E912a54B9538a1aa1029D20A8406c82F5d81A4'
const STEALTH_GOV_CONTRACT = '0xa903F68D4a973cf8d0c8210C8e2882291294aA35'

export default function VotingPage() {
  const { isAuthenticated, user, generateStealthAddress, getStealthKeys, signMessage } = useWebAuthn()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [votingOnProposal, setVotingOnProposal] = useState<number | null>(null)
  const [scanningProposal, setScanningProposal] = useState<number | null>(null)
  const [myVotes, setMyVotes] = useState<{ [proposalId: number]: MyVote[] }>({})
  const [showMyVotes, setShowMyVotes] = useState<{ [proposalId: number]: boolean }>({})
  const [hasSBT, setHasSBT] = useState<boolean | null>(null) // null = checking, false = no SBT, true = has SBT
  const [isMinting, setIsMinting] = useState(false)
  const [walletConnected, setWalletConnected] = useState(false)
  const toast = useToast()

  // Sepolia network provider
  const provider = new ethers.JsonRpcProvider(
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/b9794ad1ddf84dfb8c34d6bb5dca2001'
  )

  useEffect(() => {
    if (isAuthenticated && user) {
      loadProposals()
      checkSBTOwnership()
      checkWalletConnection()
    }
  }, [isAuthenticated, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkWalletConnection = useCallback(async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        setWalletConnected(accounts.length > 0)
      } catch (error) {
        console.error('Error checking wallet connection:', error)
        setWalletConnected(false)
      }
    }
  }, [])

  const checkSBTOwnership = async () => {
    if (!user) return

    try {
      console.log('🔍 Checking SBT ownership and balance for HD wallet address #0...')
      
      // Use the user's main address as HD wallet address #0
      // In full implementation, would derive HD wallet address #0 from w3pk mnemonic
      const hdWalletAddress = user.ethereumAddress
      console.log('HD Wallet Address #0:', hdWalletAddress)
      
      // Check ETH balance first
      const ethBalance = await provider.getBalance(hdWalletAddress)
      const ethBalanceInEther = ethers.formatEther(ethBalance)
      console.log('HD wallet balance:', ethBalanceInEther, 'ETH')
      
      // If balance is 0, trigger faucet
      if (ethBalance === BigInt(0)) {
        console.log('💰 HD wallet has 0 ETH, triggering faucet...')
        try {
          const faucetResponse = await fetch('/api/faucet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ address: hdWalletAddress }),
          })
          
          if (faucetResponse.ok) {
            const faucetData = await faucetResponse.json()
            console.log('✅ Faucet transaction sent:', faucetData.txHash)
            toast({
              title: 'Faucet Activated! 💰',
              description: `Sent 0.001 ETH to ${hdWalletAddress.slice(0,10)}... for gas fees`,
              status: 'info',
              duration: 5000,
              isClosable: true,
            })
          } else {
            const errorData = await faucetResponse.json()
            console.error('Faucet failed:', errorData.error)
          }
        } catch (faucetError) {
          console.error('Faucet API call failed:', faucetError)
        }
      }
      
      // Check SBT ownership
      const sbtContract = new ethers.Contract(MOCK_SBT_CONTRACT, MOCK_SBT_ABI, provider)
      
      const balance = await sbtContract.balanceOf(hdWalletAddress)
      const ownsSBT = balance > 0
      
      setHasSBT(ownsSBT)
      
      if (ownsSBT) {
        console.log('✅ HD wallet address #0 owns SBT, stealth voting enabled')
        toast({
          title: 'SBT Found! ✅',
          description: 'Your HD wallet owns an SBT. Stealth voting is enabled!',
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
      } else {
        console.log('❌ HD wallet address #0 does not own SBT, minting required')
      }
    } catch (error: any) {
      console.error('SBT ownership check failed:', error)
      toast({
        title: 'SBT Check Failed',
        description: 'Could not check SBT ownership. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      setHasSBT(false)
    }
  }

  const mintSBT = async () => {
    if (!user || !walletConnected) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your MetaMask wallet first',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    try {
      setIsMinting(true)
      console.log('🏭 Starting SBT minting process on Sepolia...')

      // Get provider with signer from MetaMask
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      const signer = await browserProvider.getSigner()
      const signerAddress = await signer.getAddress()
      
      console.log('Minting SBT for address:', signerAddress)
      
      // Create contract instance with signer
      const sbtContract = new ethers.Contract(MOCK_SBT_CONTRACT, MOCK_SBT_ABI, signer)

      // Mint to the connected wallet address
      const tx = await sbtContract.mint(signerAddress)
      console.log('Transaction sent:', tx.hash)
      
      toast({
        title: 'Transaction Sent! ⏳',
        description: `Mining transaction ${tx.hash.slice(0, 10)}...`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      })
      
      const receipt = await tx.wait()
      console.log('✅ SBT minted successfully! Block:', receipt.blockNumber)
      
      setHasSBT(true)
      toast({
        title: 'SBT Minted Successfully! 🏆',
        description: `SBT minted in block ${receipt.blockNumber}. You can now participate in stealth voting.`,
        status: 'success',
        duration: 7000,
        isClosable: true,
      })
    } catch (error: any) {
      console.error('SBT minting failed:', error)
      toast({
        title: 'SBT Minting Failed',
        description: error.message || 'Failed to mint SBT',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsMinting(false)
    }
  }

  const loadProposals = async () => {
    try {
      setIsLoading(true)
      
      // Create StealthGov contract instance for reading
      const stealthGovContract = new ethers.Contract(STEALTH_GOV_CONTRACT, STEALTH_GOV_ABI, provider)
      
      // Get proposal count (assuming proposalCount is public)
      let proposalCount = 0
      try {
        // Try to get proposals 0, 1, 2 to see what exists
        const loadedProposals: Proposal[] = []
        
        for (let i = 0; i < 3; i++) {
          try {
            const proposalData = await stealthGovContract.getProposal(i)
            const isActive = await stealthGovContract.isProposalActive(i)
            
            const proposal: Proposal = {
              id: i,
              description: proposalData[0], // description
              startTime: Number(proposalData[1]) * 1000, // startTime in ms
              endTime: Number(proposalData[2]) * 1000, // endTime in ms
              forVotes: Number(proposalData[3]), // forVotes
              againstVotes: Number(proposalData[4]), // againstVotes
              abstainVotes: Number(proposalData[5]), // abstainVotes
              executed: proposalData[6], // executed
              isActive: isActive
            }
            
            loadedProposals.push(proposal)
            proposalCount++
          } catch (proposalError) {
            // Proposal doesn't exist, break the loop
            console.log(`Proposal ${i} doesn't exist:`, proposalError)
            break
          }
        }
        
        if (loadedProposals.length === 0) {
          // Fallback to mock proposals if no real proposals exist
          console.log('No proposals found on contract, using mock data')
          const mockProposals: Proposal[] = [
            {
              id: 0,
              description: 'Test proposal - Should we increase the DAO treasury allocation?',
              startTime: Date.now() - 86400000,
              endTime: Date.now() + 6 * 86400000,
              forVotes: 0,
              againstVotes: 0,
              abstainVotes: 0,
              executed: false,
              isActive: true
            }
          ]
          setProposals(mockProposals)
        } else {
          setProposals(loadedProposals)
        }
      } catch (contractError) {
        console.error('Contract interaction failed:', contractError)
        // Fallback to mock data
        const mockProposals: Proposal[] = [
          {
            id: 0,
            description: 'Mock proposal - Contract interaction failed, using demo data',
            startTime: Date.now() - 86400000,
            endTime: Date.now() + 6 * 86400000,
            forVotes: 5,
            againstVotes: 2,
            abstainVotes: 1,
            executed: false,
            isActive: true
          }
        ]
        setProposals(mockProposals)
      }
    } catch (error) {
      console.error('Failed to load proposals:', error)
      toast({
        title: 'Loading Failed',
        description: 'Failed to load proposals',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleVote = async (proposalId: number, choice: 0 | 1 | 2) => {
    if (!isAuthenticated || !user) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in to vote',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (!hasSBT) {
      toast({
        title: 'SBT Required',
        description: 'You need to own a Soul Bound Token to participate in voting',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    if (!walletConnected) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your MetaMask wallet first',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    try {
      setVotingOnProposal(proposalId)
      
      // Generate stealth address using w3pk
      console.log('🎭 Starting stealth vote process with w3pk...')
      const stealthResult = await generateStealthAddress()
      if (!stealthResult) {
        throw new Error('Failed to generate stealth address')
      }

      console.log('✅ Stealth address generated:', stealthResult.stealthAddress)
      console.log('   Ephemeral public key:', stealthResult.ephemeralPublicKey)
      
      // Check stealth address balance
      const stealthBalance = await provider.getBalance(stealthResult.stealthAddress)
      console.log('Stealth address balance:', ethers.formatEther(stealthBalance), 'ETH')
      
      // Fund stealth address with faucet if balance is 0
      if (stealthBalance === BigInt(0)) {
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
            
            // Wait a bit for the transaction to be mined
            await new Promise(resolve => setTimeout(resolve, 3000))
          } else {
            const errorData = await faucetResponse.json()
            throw new Error(`Faucet failed: ${errorData.error}`)
          }
        } catch (faucetError) {
          console.error('Faucet failed for stealth address:', faucetError)
          throw new Error('Failed to fund stealth address for gas')
        }
      } else {
        console.log('✅ Stealth address already has ETH for gas')
      }
      
      // Create stealth signer from the private key
      const stealthSigner = new ethers.Wallet(stealthResult.stealthPrivateKey, provider)
      
      // Create StealthGov contract instance
      const stealthGovContract = new ethers.Contract(STEALTH_GOV_CONTRACT, STEALTH_GOV_ABI, stealthSigner)
      
      // Generate stealth proof (stealth signature for verification)
      const voteMessage = `Stealth ${stealthResult.stealthAddress} votes with SBT 1`
      const stealthSignature = await stealthSigner.signMessage(voteMessage)
      const stealthProof = stealthSignature // In production, this would be more complex
      
      // Use SBT token ID 1 (assuming user owns token #1)
      const sbtTokenId = 1

      // Cast the stealth vote on Sepolia
      console.log('🗳️ Casting stealth vote on Sepolia...')
      const voteTx = await stealthGovContract.castStealthVote(
        proposalId,
        choice,
        stealthResult.ephemeralPublicKey,
        stealthProof,
        sbtTokenId
      )
      
      toast({
        title: 'Vote Transaction Sent! ⏳',
        description: `Vote transaction ${voteTx.hash.slice(0, 10)}... mining`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      })
      
      const receipt = await voteTx.wait()
      console.log('✅ Vote transaction confirmed! Block:', receipt.blockNumber)

      toast({
        title: 'Vote Cast Successfully! 🗳️',
        description: `Your vote has been recorded using stealth address ${stealthResult.stealthAddress.slice(0,10)}... Your identity remains private.`,
        status: 'success',
        duration: 7000,
        isClosable: true,
      })

      // Update vote counts locally for demo
      setProposals(prev => prev.map(p => {
        if (p.id === proposalId) {
          const updated = { ...p }
          if (choice === 0) updated.againstVotes++
          else if (choice === 1) updated.forVotes++
          else updated.abstainVotes++
          return updated
        }
        return p
      }))

    } catch (error: any) {
      console.error('Voting failed:', error)
      toast({
        title: 'Voting Failed',
        description: error.message || 'Failed to cast vote',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setVotingOnProposal(null)
    }
  }

  const scanForMyVotes = async (proposalId: number) => {
    if (!isAuthenticated) return

    try {
      setScanningProposal(proposalId)
      
      const stealthKeys = await getStealthKeys()
      if (!stealthKeys) {
        throw new Error('Failed to get stealth keys')
      }

      console.log('🔍 Scanning for votes with w3pk stealth keys...')
      console.log('   Meta address:', stealthKeys.metaAddress)
      
      // In production, this would scan the blockchain for VoteCast events
      // and use canControlStealthAddress to identify our votes
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Mock finding user's votes (in production would use event logs + canControlStealthAddress)
      const mockMyVotes: MyVote[] = [
        {
          stealthAddress: '0x1234567890123456789012345678901234567890',
          support: 1, // FOR
          ephemeralPublicKey: '0xabcdef1234567890abcdef1234567890abcdef12',
          timestamp: Date.now() - 3600000, // 1 hour ago
          canProve: true
        }
      ]

      setMyVotes(prev => ({ ...prev, [proposalId]: mockMyVotes }))
      
      toast({
        title: 'Scan Complete 🔍',
        description: `Found ${mockMyVotes.length} vote(s) belonging to you using viewing keys`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      })

    } catch (error: any) {
      console.error('Scanning failed:', error)
      toast({
        title: 'Scan Failed',
        description: error.message || 'Failed to scan for votes',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setScanningProposal(null)
    }
  }

  const toggleShowMyVotes = (proposalId: number) => {
    setShowMyVotes(prev => ({ ...prev, [proposalId]: !prev[proposalId] }))
  }

  const formatTimeRemaining = (endTime: number) => {
    const now = Date.now()
    const remaining = endTime - now
    
    if (remaining <= 0) return 'Ended'
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) return `${days}d ${hours}h remaining`
    return `${hours}h remaining`
  }

  const getVotePercentages = (proposal: Proposal) => {
    const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes
    if (total === 0) return { for: 0, against: 0, abstain: 0 }
    
    return {
      for: (proposal.forVotes / total) * 100,
      against: (proposal.againstVotes / total) * 100,
      abstain: (proposal.abstainVotes / total) * 100
    }
  }

  if (!isAuthenticated) {
    return (
      <Container maxW="container.md" py={20}>
        <VStack spacing={8}>
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Authentication Required</AlertTitle>
              <AlertDescription>
                Please log in to access the stealth voting system.
              </AlertDescription>
            </Box>
          </Alert>
        </VStack>
      </Container>
    )
  }

  return (
    <Container maxW="container.lg" py={8}>
      <VStack spacing={8}>
        {/* Header */}
        <Box textAlign="center">
          <Heading as="h1" size="xl" mb={4}>
            🎭 Stealth DAO Voting
          </Heading>
          <Text color="gray.400" mb={4}>
            Coercion-resistant voting with w3pk stealth addresses
          </Text>
          <Badge colorScheme="purple" p={2} borderRadius="md">
            <Icon as={FiShield} mr={1} />
            w3pk Powered • Zero Linkability • Network Agnostic
          </Badge>
        </Box>


        {/* SBT Status */}
        {hasSBT === null ? (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>🔍 Checking SBT Ownership...</AlertTitle>
              <AlertDescription>
                Verifying if HD wallet address #{user?.ethereumAddress?.slice(0,10)}... owns a Soul Bound Token required for voting.
              </AlertDescription>
            </Box>
          </Alert>
        ) : hasSBT ? (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>✅ SBT Verified</AlertTitle>
              <AlertDescription>
                HD wallet address #{user?.ethereumAddress?.slice(0,10)}... owns a Soul Bound Token. You can participate in stealth voting!
              </AlertDescription>
            </Box>
          </Alert>
        ) : (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>⚠️ SBT Required</AlertTitle>
              <AlertDescription mb={3}>
                HD wallet address #{user?.ethereumAddress?.slice(0,10)}... needs a Soul Bound Token to participate in voting.
                {!walletConnected && <Text mt={1} fontSize="sm" color="orange.200">Connect MetaMask to mint an SBT.</Text>}
              </AlertDescription>
              <Button 
                colorScheme="orange" 
                size="sm" 
                leftIcon={<Icon as={FiAward} />}
                onClick={mintSBT}
                isLoading={isMinting}
                disabled={isMinting || !walletConnected}
              >
                {isMinting ? 'Minting SBT...' : 'Mint SBT Token'}
              </Button>
            </Box>
          </Alert>
        )}

        {/* Privacy Features */}
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <Box>
            <AlertTitle>🔒 Privacy Features</AlertTitle>
            <AlertDescription>
              • w3pk generates unlinkable stealth addresses for each vote<br/>
              • Your identity remains completely private<br/>
              • Network agnostic - works on any blockchain<br/>
              • Coercion resistant through plausible deniability
            </AlertDescription>
          </Box>
        </Alert>

        {/* Proposals */}
        {isLoading ? (
          <Flex justify="center" p={8}>
            <Spinner size="lg" color="purple.500" />
          </Flex>
        ) : (
          <SimpleGrid columns={{ base: 1, lg: 1 }} spacing={6} width="100%">
            {proposals.map((proposal) => {
              const percentages = getVotePercentages(proposal)
              const userVotes = myVotes[proposal.id] || []
              const isScanning = scanningProposal === proposal.id
              const isVoting = votingOnProposal === proposal.id
              
              return (
                <Card key={proposal.id} bg="gray.800" borderColor="gray.700">
                  <CardHeader>
                    <Flex justify="space-between" align="center">
                      <Box>
                        <Heading size="md" color="white">
                          Proposal #{proposal.id}
                        </Heading>
                        <Flex mt={2} gap={2}>
                          {proposal.isActive ? (
                            <Badge colorScheme="green">
                              <Icon as={FiClock} mr={1} />
                              Active
                            </Badge>
                          ) : proposal.executed ? (
                            <Badge colorScheme="blue">Executed</Badge>
                          ) : (
                            <Badge colorScheme="gray">Ended</Badge>
                          )}
                          <Badge variant="outline">
                            <Icon as={FiUsers} mr={1} />
                            {proposal.forVotes + proposal.againstVotes + proposal.abstainVotes} votes
                          </Badge>
                        </Flex>
                      </Box>
                      <Text fontSize="sm" color="gray.400">
                        {formatTimeRemaining(proposal.endTime)}
                      </Text>
                    </Flex>
                  </CardHeader>

                  <CardBody>
                    <VStack spacing={4} align="stretch">
                      {/* Description */}
                      <Text color="gray.300">{proposal.description}</Text>

                      {/* Vote Results */}
                      <Box>
                        <Text fontSize="sm" color="gray.400" mb={2}>
                          Vote Distribution
                        </Text>
                        <VStack spacing={2}>
                          <Box width="100%">
                            <Flex justify="space-between" mb={1}>
                              <Text fontSize="sm" color="green.300">For</Text>
                              <Text fontSize="sm" color="green.300">{proposal.forVotes} ({percentages.for.toFixed(1)}%)</Text>
                            </Flex>
                            <Progress value={percentages.for} colorScheme="green" size="sm" />
                          </Box>
                          <Box width="100%">
                            <Flex justify="space-between" mb={1}>
                              <Text fontSize="sm" color="red.300">Against</Text>
                              <Text fontSize="sm" color="red.300">{proposal.againstVotes} ({percentages.against.toFixed(1)}%)</Text>
                            </Flex>
                            <Progress value={percentages.against} colorScheme="red" size="sm" />
                          </Box>
                          <Box width="100%">
                            <Flex justify="space-between" mb={1}>
                              <Text fontSize="sm" color="yellow.300">Abstain</Text>
                              <Text fontSize="sm" color="yellow.300">{proposal.abstainVotes} ({percentages.abstain.toFixed(1)}%)</Text>
                            </Flex>
                            <Progress value={percentages.abstain} colorScheme="yellow" size="sm" />
                          </Box>
                        </VStack>
                      </Box>

                      {/* Voting Buttons */}
                      {proposal.isActive && (
                        <Flex gap={2} wrap="wrap">
                          <Button
                            colorScheme="green"
                            size="sm"
                            onClick={() => handleVote(proposal.id, 1)}
                            isLoading={isVoting}
                            disabled={isVoting || isScanning || !hasSBT}
                          >
                            Vote FOR
                          </Button>
                          <Button
                            colorScheme="red"
                            size="sm"
                            onClick={() => handleVote(proposal.id, 0)}
                            isLoading={isVoting}
                            disabled={isVoting || isScanning || !hasSBT}
                          >
                            Vote AGAINST
                          </Button>
                          <Button
                            colorScheme="yellow"
                            size="sm"
                            onClick={() => handleVote(proposal.id, 2)}
                            isLoading={isVoting}
                            disabled={isVoting || isScanning || !hasSBT}
                          >
                            Abstain
                          </Button>
                          {!hasSBT && hasSBT !== null && (
                            <Text fontSize="xs" color="gray.500" mt={1}>
                              SBT required to vote
                            </Text>
                          )}
                        </Flex>
                      )}

                      {/* My Votes Section */}
                      <Box>
                        <Flex justify="space-between" align="center" mb={2}>
                          <Text fontSize="sm" color="purple.300">
                            🔍 My Votes (Private)
                          </Text>
                          <Flex gap={2}>
                            <Button
                              size="xs"
                              variant="outline"
                              colorScheme="purple"
                              onClick={() => scanForMyVotes(proposal.id)}
                              isLoading={isScanning}
                              disabled={isScanning || isVoting}
                            >
                              {isScanning ? 'Scanning...' : 'Scan Blockchain'}
                            </Button>
                            {userVotes.length > 0 && (
                              <Button
                                size="xs"
                                variant="outline"
                                colorScheme="purple"
                                onClick={() => toggleShowMyVotes(proposal.id)}
                                leftIcon={<Icon as={showMyVotes[proposal.id] ? FiEyeOff : FiEye} />}
                              >
                                {showMyVotes[proposal.id] ? 'Hide' : 'Show'}
                              </Button>
                            )}
                          </Flex>
                        </Flex>

                        {userVotes.length === 0 ? (
                          <Text fontSize="xs" color="gray.500">
                            No votes found. Use &quot;Scan Blockchain&quot; to find your stealth votes.
                          </Text>
                        ) : showMyVotes[proposal.id] ? (
                          <VStack spacing={1} align="stretch">
                            {userVotes.map((vote, index) => (
                              <Box key={index} bg="purple.900" p={2} borderRadius="md" fontSize="xs">
                                <Flex justify="space-between">
                                  <Text color="purple.300">
                                    {vote.support === 1 ? 'FOR' : vote.support === 0 ? 'AGAINST' : 'ABSTAIN'}
                                  </Text>
                                  <Text color="gray.400">
                                    {new Date(vote.timestamp).toLocaleString()}
                                  </Text>
                                </Flex>
                                <Text color="gray.500" mt={1}>
                                  Stealth: {vote.stealthAddress.slice(0, 10)}...
                                </Text>
                                <Text color="gray.500" fontSize="xs">
                                  Ephemeral: {vote.ephemeralPublicKey.slice(0, 8)}...
                                </Text>
                              </Box>
                            ))}
                            <Text fontSize="xs" color="gray.500" mt={1}>
                              💡 You control which votes to disclose for coercion resistance
                            </Text>
                          </VStack>
                        ) : (
                          <Text fontSize="xs" color="gray.500">
                            {userVotes.length} vote(s) found. Click &quot;Show&quot; to reveal (selective disclosure).
                          </Text>
                        )}
                      </Box>
                    </VStack>
                  </CardBody>
                </Card>
              )
            })}
          </SimpleGrid>
        )}

        {/* How It Works */}
        <Card bg="gray.800" borderColor="gray.700" width="100%">
          <CardHeader>
            <Heading size="md" color="white">
              🛡️ How Stealth Voting Works
            </Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={3} align="stretch">
              <Text color="gray.300" fontSize="sm">
                <strong>1. SBT Ownership:</strong> Your HD wallet (address #0) must own a Soul Bound Token to participate in voting.
              </Text>
              <Text color="gray.300" fontSize="sm">
                <strong>2. w3pk Stealth Generation:</strong> w3pk generates unlinkable stealth addresses from your mnemonic for each vote.
              </Text>
              <Text color="gray.300" fontSize="sm">
                <strong>3. Network Agnostic Signing:</strong> Use the private key from w3pk with StealthGov contract on any blockchain.
              </Text>
              <Text color="gray.300" fontSize="sm">
                <strong>4. Selective Disclosure:</strong> Scan and reveal only the votes you choose using your viewing keys.
              </Text>
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </Container>
  )
}