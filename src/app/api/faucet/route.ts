import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: 'Invalid address provided' }, { status: 400 })
    }

    // Get faucet private key from environment
    const faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY
    if (!faucetPrivateKey) {
      console.error('FAUCET_PRIVATE_KEY not configured')
      return NextResponse.json({ error: 'Faucet not configured' }, { status: 500 })
    }

    // Create provider and faucet wallet
    const provider = new ethers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://gateway.tenderly.co/public/sepolia'
    )

    const faucetWallet = new ethers.Wallet(faucetPrivateKey, provider)

    // Check faucet balance
    const faucetBalance = await provider.getBalance(faucetWallet.address)
    const requiredAmount = ethers.parseEther('0.001')

    if (faucetBalance < requiredAmount) {
      return NextResponse.json({ error: 'Faucet has insufficient funds' }, { status: 500 })
    }

    // Send 0.001 ETH to the address
    console.log(`🚰 Faucet sending 0.001 ETH to ${address}`)

    const tx = await faucetWallet.sendTransaction({
      to: address,
      value: requiredAmount,
      gasLimit: 21000,
    })

    console.log(`✅ Faucet transaction sent: ${tx.hash}`)

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: '0.001',
      message: 'Faucet transaction sent successfully',
    })
  } catch (error: any) {
    console.error('Faucet API error:', error)
    return NextResponse.json(
      { error: error.message || 'Faucet transaction failed' },
      { status: 500 }
    )
  }
}
