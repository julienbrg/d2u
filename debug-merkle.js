const { ethers } = require('ethers');

// Try different orderings
const holders1 = [
  '0x045488e4b36be33d3ba310bb64853209e12e9d59',
  '0x8c83499ad0e57ef291daa94a8063f402376e5961'
];

const holders2 = [
  '0x8c83499ad0e57ef291daa94a8063f402376e5961',
  '0x045488e4b36be33d3ba310bb64853209e12e9d59'
];

console.log('Trying both orders...');
console.log('Order 1:', holders1);
console.log('Order 2:', holders2);

// Test both orders
[holders1, holders2].forEach((holders, orderIndex) => {
  console.log(`\n=== Testing Order ${orderIndex + 1} ===`);
  console.log('Holders:', holders);

  // Calculate the same way as in frontend/w3pk
  const hash1 = ethers.keccak256(ethers.toUtf8Bytes(holders[0]));
  const hash2 = ethers.keccak256(ethers.toUtf8Bytes(holders[1]));

  console.log('Hash 1 (as string):', hash1);
  console.log('Hash 2 (as string):', hash2);

  // Try with address encoding (20 bytes)
  const hashAddr1 = ethers.keccak256(holders[0]);
  const hashAddr2 = ethers.keccak256(holders[1]);

  console.log('Hash 1 (as address):', hashAddr1);
  console.log('Hash 2 (as address):', hashAddr2);

  // Calculate merkle root both ways
  const rootFromString = ethers.keccak256(ethers.concat([hash1, hash2]));
  const rootFromAddr = ethers.keccak256(ethers.concat([hashAddr1, hashAddr2]));

  console.log('Root from string hashes:', rootFromString);
  console.log('Root from string hashes (decimal):', BigInt(rootFromString).toString());

  console.log('Root from address hashes:', rootFromAddr);
  console.log('Root from address hashes (decimal):', BigInt(rootFromAddr).toString());

  const expected = '64480179879812629116247243169840919019817253629834425188220177936541956005396';
  console.log('Expected from frontend:', expected);
  console.log('String method matches:', BigInt(rootFromString).toString() === expected ? 'YES' : 'NO');
  console.log('Address method matches:', BigInt(rootFromAddr).toString() === expected ? 'YES' : 'NO');
});