import { ethers } from 'ethers'

const SBT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

export async function fetchSBTHolders(
  sbtContractAddress: string,
  provider: ethers.Provider
): Promise<string[]> {
  try {
    const contract = new ethers.Contract(sbtContractAddress, SBT_ABI, provider)

    try {
      // Try to get holders using Transfer events (more reliable)
      const holders = new Set<string>()
      
      try {
        console.log('Fetching SBT holders via Transfer events...')
        const transferFilter = contract.filters.Transfer(ethers.ZeroAddress, null, null)
        const transferEvents = await contract.queryFilter(transferFilter, 9407254, 'latest')
        
        console.log(`Found ${transferEvents.length} SBT mint events`)
        
        for (const event of transferEvents) {
          if ('args' in event && event.args) {
            const to = event.args.to
            if (to && to !== ethers.ZeroAddress) {
              holders.add(to.toLowerCase())
              console.log('Added SBT holder:', to.toLowerCase())
            }
          }
        }
      } catch (eventError) {
        console.warn('Transfer event method failed, trying tokenByIndex fallback:', eventError)
        
        // Fallback to tokenByIndex method
        const totalSupply = await contract.totalSupply()
        console.log(`Total SBT supply: ${totalSupply}`)

        for (let i = 0; i < Number(totalSupply); i++) {
          try {
            const tokenId = await contract.tokenByIndex(i)
            const owner = await contract.ownerOf(tokenId)

            if (owner && owner !== ethers.ZeroAddress) {
              holders.add(owner.toLowerCase())
            }

            if (i < Number(totalSupply) - 1) {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          } catch (error) {
            console.warn(`Failed to fetch owner for token index ${i}:`, error)
          }
        }
      }

      const holderArray = Array.from(holders)
      console.log(`Found ${holderArray.length} unique SBT holders`)
      return holderArray
    } catch (supplyError) {
      console.warn('totalSupply method failed, trying event-based approach...')
    }

    const filter = contract.filters.Transfer(null, null, null)
    const startBlock = 9407254

    console.log('Fetching Transfer events from block', startBlock)

    const events = await contract.queryFilter(filter, startBlock, 'latest')
    const holders = new Set<string>()

    events.forEach(event => {
      if ('args' in event && event.args) {
        const to = event.args.to
        const from = event.args.from

        if (to && to !== ethers.ZeroAddress) {
          holders.add(to.toLowerCase())
        }

        if (from && from !== ethers.ZeroAddress && to === ethers.ZeroAddress) {
          holders.delete(from.toLowerCase())
        }
      }
    })

    const holderArray = Array.from(holders)
    console.log(`Found ${holderArray.length} unique SBT holders from events`)
    return holderArray
  } catch (error) {
    console.error('Error fetching SBT holders:', error)
    throw new Error('Failed to fetch SBT holders')
  }
}

export async function checkHasSBT(
  address: string,
  sbtContractAddress: string,
  provider: ethers.Provider
): Promise<boolean> {
  try {
    const contract = new ethers.Contract(sbtContractAddress, SBT_ABI, provider)
    const balance = await contract.balanceOf(address)
    return Number(balance) > 0
  } catch (error) {
    console.error('Error checking SBT balance:', error)
    return false
  }
}

export async function getSBTTokenId(
  address: string,
  sbtContractAddress: string,
  provider: ethers.Provider
): Promise<number | null> {
  try {
    const contract = new ethers.Contract(sbtContractAddress, SBT_ABI, provider)
    const balance = await contract.balanceOf(address)

    if (Number(balance) === 0) return null

    const tokenId = await contract.tokenOfOwnerByIndex(address, 0)
    return Number(tokenId)
  } catch (error) {
    console.error('Error getting SBT token ID:', error)
    return null
  }
}

const CACHE_KEY = 'sbt_holders_cache'
const CACHE_EXPIRY_MS = 5 * 60 * 1000

interface HoldersCache {
  holders: string[]
  timestamp: number
  contractAddress: string
}

export function getCachedHolders(contractAddress: string): string[] | null {
  try {
    if (typeof window === 'undefined') return null
    
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const data: HoldersCache = JSON.parse(cached)

    if (
      data.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
      Date.now() - data.timestamp < CACHE_EXPIRY_MS
    ) {
      console.log('Using cached SBT holders')
      return data.holders
    }

    return null
  } catch (error) {
    console.error('Error reading cache:', error)
    return null
  }
}

export function setCachedHolders(contractAddress: string, holders: string[]): void {
  try {
    if (typeof window === 'undefined') return
    
    const cache: HoldersCache = {
      holders,
      timestamp: Date.now(),
      contractAddress: contractAddress.toLowerCase(),
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    console.log('Cached SBT holders')
  } catch (error) {
    console.error('Error writing cache:', error)
  }
}

export async function fetchSBTHoldersWithCache(
  sbtContractAddress: string,
  provider: ethers.Provider
): Promise<string[]> {
  const cached = getCachedHolders(sbtContractAddress)
  if (cached) return cached

  const holders = await fetchSBTHolders(sbtContractAddress, provider)

  setCachedHolders(sbtContractAddress, holders)

  return holders
}
