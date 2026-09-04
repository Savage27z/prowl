// Solidity test suite for ProwlBounty.
//
// Focus is the settlement paths and the invariants money depends on: per-bounty
// stake isolation, the 5% fee split, state-machine guards, time boundaries,
// access control and reentrancy. Several tests lock in fixes for bugs that were
// live on the previously deployed contract; those are marked (regression).

// CJS require to match hardhat.config.ts / scripts/deploy.ts — this Hardhat
// version does not expose a named `ethers` ESM export.
/* eslint-disable @typescript-eslint/no-require-imports */
// Hardhat's runtime contract and signer objects are dynamically typed;
// typechain bindings are excluded from this tsconfig, so `any` is the
// honest annotation here rather than a fabricated interface.
/* eslint-disable @typescript-eslint/no-explicit-any */
const { expect } = require('chai');
const hre = require('hardhat');
const { ethers } = hre;
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const REWARD = ethers.parseEther('1');
const STAKE = ethers.parseEther('0.001');
const TX_HASH = ethers.id('incident-tx');
const CLAIM_PERIOD = 3 * 24 * 60 * 60;
const TIMEOUT_PERIOD = 7 * 24 * 60 * 60;
const FEE = (REWARD * 500n) / 10000n;

describe('ProwlBounty', () => {
  let bounty: any;
  let treasury: any, poster: any, agent: any, other: any;
  let victim: string;

  beforeEach(async () => {
    [treasury, poster, agent, other] = await ethers.getSigners();
    victim = other.address;
    const Factory = await ethers.getContractFactory('ProwlBounty');
    bounty = await Factory.deploy(treasury.address);
    await bounty.waitForDeployment();
  });

  const addr = async () => await bounty.getAddress();
  const escrow = async () => await ethers.provider.getBalance(await addr());

  async function postBounty(value = REWARD) {
    await (await bounty.connect(poster).postBounty(victim, TX_HASH, 'stolen funds', { value })).wait();
    return Number(await bounty.bountyCount()) - 1;
  }
  async function claimed() {
    const id = await postBounty();
    await bounty.connect(agent).claimBounty(id, { value: STAKE });
    return id;
  }
  async function submitted() {
    const id = await claimed();
    await bounty.connect(agent).submitReport(id, ethers.id('report'));
    return id;
  }

  describe('deployment', () => {
    it('rejects a zero treasury', async () => {
      const F = await ethers.getContractFactory('ProwlBounty');
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWith('Invalid treasury');
    });
    it('exposes fee and period constants', async () => {
      expect(await bounty.PROTOCOL_FEE_BPS()).to.equal(500n);
      expect(await bounty.CLAIM_PERIOD()).to.equal(BigInt(CLAIM_PERIOD));
      expect(await bounty.TIMEOUT_PERIOD()).to.equal(BigInt(TIMEOUT_PERIOD));
    });
  });

  describe('postBounty', () => {
    it('escrows the reward and counts it open', async () => {
      const id = await postBounty();
      const b = await bounty.getBounty(id);
      expect(b.reward).to.equal(REWARD);
      expect(b.status).to.equal(0n);
      expect(await bounty.openBountyCount()).to.equal(1n);
      expect(await escrow()).to.equal(REWARD);
    });
    it('validates its inputs', async () => {
      await expect(bounty.connect(poster).postBounty(victim, TX_HASH, 'x', { value: 0 }))
        .to.be.revertedWith('Reward must be > 0');
      await expect(bounty.connect(poster).postBounty(ethers.ZeroAddress, TX_HASH, 'x', { value: REWARD }))
        .to.be.revertedWith('Invalid wallet address');
      await expect(bounty.connect(poster).postBounty(victim, ethers.ZeroHash, 'x', { value: REWARD }))
        .to.be.revertedWith('Invalid tx hash');
    });
  });

  describe('claimBounty', () => {
    it('requires the minimum stake', async () => {
      const id = await postBounty();
      await expect(bounty.connect(agent).claimBounty(id, { value: STAKE - 1n }))
        .to.be.revertedWith('Insufficient stake');
    });
    it('stops the poster claiming their own bounty', async () => {
      const id = await postBounty();
      await expect(bounty.connect(poster).claimBounty(id, { value: STAKE }))
        .to.be.revertedWith('Poster cannot claim own bounty');
    });
    it('prevents a double claim', async () => {
      const id = await claimed();
      await expect(bounty.connect(other).claimBounty(id, { value: STAKE }))
        .to.be.revertedWith('Bounty not open');
    });
    it('escrows the stake against the bounty', async () => {
      const id = await claimed();
      expect(await bounty.bountyStakes(id)).to.equal(STAKE);
      expect(await bounty.openBountyCount()).to.equal(0n);
    });
  });

  describe('submitReport', () => {
    it('only the claiming agent may submit', async () => {
      const id = await claimed();
      await expect(bounty.connect(other).submitReport(id, ethers.id('r')))
        .to.be.revertedWith('Only claimer can submit');
    });
    it('rejects an empty hash or an unclaimed bounty', async () => {
      const id = await claimed();
      await expect(bounty.connect(agent).submitReport(id, ethers.ZeroHash))
        .to.be.revertedWith('Invalid report hash');
      const fresh = await postBounty();
      await expect(bounty.connect(agent).submitReport(fresh, ethers.id('r')))
        .to.be.revertedWith('Bounty not claimed');
    });
  });

  describe('approvePayout', () => {
    it('pays agent 95% + stake and treasury 5%', async () => {
      const id = await submitted();
      const a0 = await ethers.provider.getBalance(agent.address);
      const t0 = await ethers.provider.getBalance(treasury.address);
      await bounty.connect(poster).approvePayout(id);
      expect((await ethers.provider.getBalance(agent.address)) - a0).to.equal(REWARD - FEE + STAKE);
      expect((await ethers.provider.getBalance(treasury.address)) - t0).to.equal(FEE);
      expect(await bounty.totalFeesCollected()).to.equal(FEE);
    });
    it('only the poster may approve', async () => {
      const id = await submitted();
      await expect(bounty.connect(other).approvePayout(id))
        .to.be.revertedWith('Only poster can approve');
    });
    it('cannot pay twice', async () => {
      const id = await submitted();
      await bounty.connect(poster).approvePayout(id);
      await expect(bounty.connect(poster).approvePayout(id))
        .to.be.revertedWith('Report not submitted');
    });
    it('drains the escrow exactly', async () => {
      const id = await submitted();
      await bounty.connect(poster).approvePayout(id);
      expect(await escrow()).to.equal(0n);
      expect(await bounty.bountyStakes(id)).to.equal(0n);
    });
  });

  // The deployed contract pooled stakes per agent, so settling one bounty paid
  // out the agent's ENTIRE pool and zeroed it, draining escrow belonging to
  // other bounties and refunding nothing on the rest.
  describe('per-bounty stake isolation (regression)', () => {
    it('settling one bounty leaves another stake untouched and still payable', async () => {
      const first = await submitted();
      const second = await postBounty();
      await bounty.connect(agent).claimBounty(second, { value: STAKE });

      await bounty.connect(poster).approvePayout(first);
      expect(await bounty.bountyStakes(second)).to.equal(STAKE);
      expect(await bounty.bountyStakes(first)).to.equal(0n);

      await bounty.connect(agent).submitReport(second, ethers.id('r2'));
      const a0 = await ethers.provider.getBalance(agent.address);
      await bounty.connect(poster).approvePayout(second);
      expect((await ethers.provider.getBalance(agent.address)) - a0).to.equal(REWARD - FEE + STAKE);
      expect(await escrow()).to.equal(0n);
    });
  });

  describe('resolveTimeout', () => {
    it('reverts before the window elapses', async () => {
      const id = await submitted();
      await time.increase(TIMEOUT_PERIOD - 60);
      await expect(bounty.resolveTimeout(id)).to.be.revertedWith('Timeout not reached');
    });
    it('settles on the same terms once elapsed, callable by anyone', async () => {
      const id = await submitted();
      await time.increase(TIMEOUT_PERIOD + 1);
      const a0 = await ethers.provider.getBalance(agent.address);
      await bounty.connect(other).resolveTimeout(id);
      expect((await ethers.provider.getBalance(agent.address)) - a0).to.equal(REWARD - FEE + STAKE);
    });
  });

  describe('cancelBounty', () => {
    it('refunds an unclaimed bounty', async () => {
      const id = await postBounty();
      await expect(bounty.connect(poster).cancelBounty(id))
        .to.emit(bounty, 'RefundIssued').withArgs(id, poster.address, REWARD);
      expect(await escrow()).to.equal(0n);
      expect(await bounty.openBountyCount()).to.equal(0n);
    });
    it('is poster-only and open-only', async () => {
      const open = await postBounty();
      await expect(bounty.connect(other).cancelBounty(open)).to.be.revertedWith('Only poster can cancel');
      const id = await claimed();
      await expect(bounty.connect(poster).cancelBounty(id)).to.be.revertedWith('Bounty not open');
    });
  });

  // Before reclaimAbandoned, a bounty stuck in Claimed had no exit at all:
  // resolveTimeout requires Submitted, so the poster's funds were locked forever.
  describe('reclaimAbandoned (regression)', () => {
    it('reverts before the claim period elapses', async () => {
      const id = await claimed();
      await time.increase(CLAIM_PERIOD - 60);
      await expect(bounty.reclaimAbandoned(id)).to.be.revertedWith('Claim period not elapsed');
    });
    it('returns reward plus forfeited stake to the poster', async () => {
      const id = await claimed();
      await time.increase(CLAIM_PERIOD + 1);
      const p0 = await ethers.provider.getBalance(poster.address);
      await (await bounty.connect(other).reclaimAbandoned(id)).wait();
      expect((await ethers.provider.getBalance(poster.address)) - p0).to.equal(REWARD + STAKE);
      expect(await escrow()).to.equal(0n);
    });
    it('does not apply once a report is submitted', async () => {
      const id = await submitted();
      await time.increase(CLAIM_PERIOD + 1);
      await expect(bounty.reclaimAbandoned(id)).to.be.revertedWith('Bounty not claimed');
    });
  });

  // Disputed was previously a terminal dead state with no exit, locking both
  // the reward and the stake permanently.
  describe('resolveDispute (regression)', () => {
    async function disputed() {
      const id = await submitted();
      await bounty.connect(poster).disputeReport(id);
      return id;
    }
    it('only the treasury may arbitrate', async () => {
      const id = await disputed();
      await expect(bounty.connect(poster).resolveDispute(id, true))
        .to.be.revertedWith('Only treasury can arbitrate');
    });
    it('upholding pays the agent and emits DisputeResolved(true)', async () => {
      const id = await disputed();
      const a0 = await ethers.provider.getBalance(agent.address);
      await expect(bounty.connect(treasury).resolveDispute(id, true))
        .to.emit(bounty, 'DisputeResolved').withArgs(id, true);
      expect((await ethers.provider.getBalance(agent.address)) - a0).to.equal(REWARD - FEE + STAKE);
    });
    it('rejecting refunds the poster and forfeits the stake', async () => {
      const id = await disputed();
      const p0 = await ethers.provider.getBalance(poster.address);
      await (await bounty.connect(treasury).resolveDispute(id, false)).wait();
      expect((await ethers.provider.getBalance(poster.address)) - p0).to.equal(REWARD + STAKE);
      expect(await escrow()).to.equal(0n);
    });
    it('rejects a bounty that is not disputed', async () => {
      const id = await submitted();
      await expect(bounty.connect(treasury).resolveDispute(id, true))
        .to.be.revertedWith('Bounty not disputed');
    });
  });

  describe('reentrancy', () => {
    it('an agent re-entering on payout cannot be paid twice', async () => {
      const F = await ethers.getContractFactory('ReentrantAgent');
      const attacker: any = await F.deploy(await addr());
      await attacker.waitForDeployment();

      const id = await postBounty();
      await attacker.claim(id, { value: STAKE });
      await attacker.submit(id, ethers.id('r'));

      // A second bounty funds the contract, so a successful drain would show
      // up as escrow loss rather than a plain out-of-funds revert.
      await postBounty();

      // The attacker re-enters resolveTimeout from receive(); effects run
      // before interactions, so the bounty is already Approved and the inner
      // call reverts, which bubbles up and reverts the whole settlement.
      await expect(bounty.connect(poster).approvePayout(id)).to.be.reverted;

      // Nothing left the contract: both rewards and the stake are intact.
      expect(await escrow()).to.equal(REWARD + REWARD + STAKE);
      expect(await bounty.bountyStakes(id)).to.equal(STAKE);
    });
  });
});
