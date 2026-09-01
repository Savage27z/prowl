// Deploy — push BountyContract to Base chain
const hre = require('hardhat');

async function main() {
  console.log('Deploying ProwlBounty contract to Base Sepolia...');

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer address:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Deployer balance:', hre.ethers.formatEther(balance), 'ETH');

  const ProwlBounty = await hre.ethers.getContractFactory('ProwlBounty');
  const bounty = await ProwlBounty.deploy();

  await bounty.waitForDeployment();
  const address = await bounty.getAddress();

  console.log('');
  console.log('✅ ProwlBounty deployed to:', address);
  console.log('');
  console.log('Next steps:');
  console.log(`1. Set NEXT_PUBLIC_BOUNTY_CONTRACT=${address} in Vercel env vars`);
  console.log('2. Verify on Basescan:');
  console.log(`   npx hardhat verify --network base-sepolia ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
