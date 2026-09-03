# Prowl 🐾

**AI investigation swarm that traces stolen crypto on Base.**

Three specialist agents coordinate through Sibyl Memory to solve onchain bounties — what one case learns, the next one starts with.

🌐 **Live:** [prowl-ebon.vercel.app](https://prowl-ebon.vercel.app)

---

## The Problem

Crypto theft is rising, but investigating it requires deep onchain expertise. Victims post on Twitter, hire freelancers, or give up. There's no coordinated, persistent system that learns from every investigation.

## How Prowl Solves It

Prowl is a swarm of AI agents that investigate crypto theft as a team:

| Agent | Role | What It Does |
|-------|------|-------------|
| 🔍 **Tracer** | Flow Analysis | Follows stolen funds hop-by-hop across wallets |
| 🧠 **Analyst** | Pattern Matching | Matches against known scam patterns from past cases |
| 📡 **Monitor** | Surveillance | Watches dormant wallets, resumes when funds move |
| 🎯 **Coordinator** | Case Lead | Orchestrates the pipeline: Tracer → Analyst → Monitor |

**The flow:** Someone posts a bounty ("find where my stolen 2 ETH went") → Coordinator assigns Tracer → Tracer follows the money, writes findings to Sibyl Memory → Analyst reads hops, matches patterns → Monitor watches dead ends → Case solved → Reward released from smart contract escrow (5% protocol fee, 95% to investigator).

---

## Where Memory Is Load-Bearing

Memory isn't a feature — it's the backbone. Without it:

- **Agents can't coordinate** — Tracer writes hops, Analyst reads them. No memory = no pipeline.
- **No pattern recognition** — Every case starts from zero. With memory, 5 solved cases make case 6 faster.
- **No watchlists** — Dormant funds are never re-traced. Monitor needs persistent state.
- **Delete memory → Investigation fails.** Prove it at `/memory` → Clear All → watch agents stumble.

### Memory Coordination Flow

```
Bounty Posted → Coordinator assigns Tracer
    ↓
Tracer traces funds hop-by-hop → writes to Sibyl Memory
    ↓
Analyst reads hops → matches against pattern memory → writes analysis
    ↓
Tracer reads analysis ("skip this address — known exchange")
    ↓
Tracer hits dead end → writes to memory
    ↓
Monitor reads dead ends → starts watching addresses
    ↓
Monitor detects movement → writes alert → Tracer resumes
    ↓
Case solved → patterns stored → next case starts smarter
```

**Memory writes:** [`tracer.ts`](src/agents/tracer.ts), [`analyst.ts`](src/agents/analyst.ts), [`monitor.ts`](src/agents/monitor.ts)
**Memory reads:** [`analyst.ts`](src/agents/analyst.ts), [`tracer.ts`](src/agents/tracer.ts), [`monitor.ts`](src/agents/monitor.ts)
**Orchestration:** [`coordinator.ts`](src/agents/coordinator.ts)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│               Next.js Frontend                  │
│   Dashboard · Cases · Patterns · Sibyl Memory   │
│   Bounty Form · Agent Status · Payouts          │
└──────────────────┬──────────────────────────────┘
                   │ Polling + REST API
┌──────────────────┴──────────────────────────────┐
│              Coordinator Agent                  │
│    Orchestrates: Tracer → Analyst → Monitor     │
└──────┬───────────┬───────────┬──────────────────┘
       │           │           │
  ┌────┴───┐  ┌────┴───┐  ┌───┴────┐
  │ Tracer │  │Analyst │  │Monitor │
  │   🔍   │  │   🧠   │  │   📡   │
  └───┬────┘  └───┬────┘  └───┬────┘
      │           │           │
      └─────── Sibyl Memory ──┘
         (shared state store)
              │
     ┌────────┴────────┐
     │   Base Sepolia   │  ← Basescan API + RPC
     │  ProwlBounty.sol │  ← Escrow smart contract
     └─────────────────┘
```

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** TailwindCSS v4, CSS custom properties, full dark mode
- **AI Reasoning:** OpenRouter API (DeepSeek model)
- **Memory:** Sibyl Memory SDK — tri-mode adapter (in-memory dev / Redis persistent / Python bridge for Sibyl SDK)
- **Chain:** Base Sepolia L2, Basescan API, viem
- **Wallet:** RainbowKit + wagmi, SIWE authentication
- **Contracts:** Solidity 0.8.20, Hardhat, bounty escrow on Base
- **Real-time:** Polling + event log for live investigation updates
- **Auth:** iron-session encrypted cookies + SIWE

## Revenue Model

Prowl captures value at the resolution layer:

| Event | What happens | Who pays |
|-------|-------------|----------|
| Bounty posted | Full reward locked in escrow | Victim/poster |
| Case solved | 95% to investigating agent, **5% protocol fee** to treasury | Deducted from reward |
| Case unsolved | Full refund to poster | Nobody |

The 5% fee is enforced onchain by `ProwlBounty.sol` — no off-chain billing, no subscriptions. Revenue scales linearly with solved cases. Cross-case memory creates a flywheel: more solved cases = richer pattern database = faster solves = more throughput.

---

## Partner Stacks

- **Base** — Bounty smart contracts deployed on Base. All transactions (bounty posting, escrow, payouts) happen onchain. Agents read Base chain data for investigations.
- **Virtuals Protocol** — Agents register on the Virtuals network via ACP (Agent Commerce Protocol). Other agents can discover and hire Prowl for investigations.

---

## Project Structure

```
prowl/
├── contracts/
│   └── BountyContract.sol           # Bounty escrow on Base
├── sibyl-bridge/
│   ├── server.py                    # Python REST bridge to sibyl-memory-client
│   └── requirements.txt
├── src/
│   ├── agents/
│   │   ├── coordinator.ts           # Orchestrates the 3 agents
│   │   ├── tracer.ts                # Fund tracing agent
│   │   ├── analyst.ts               # Pattern matching agent
│   │   ├── monitor.ts               # Dormant wallet watcher
│   │   └── ai.ts                    # OpenRouter AI wrapper
│   ├── memory/
│   │   ├── sibyl.ts                 # Unified memory adapter
│   │   └── schemas.ts               # Memory collection schemas
│   ├── virtuals/
│   │   └── acp.ts                   # Virtuals Protocol ACP integration
│   ├── chain/
│   │   ├── reader.ts                # Read Base chain data
│   │   ├── contracts.ts             # Smart contract ABI + config
│   │   └── utils.ts                 # Address utils, tx parsing
│   ├── app/
│   │   ├── dashboard/page.tsx       # Data-driven dashboard
│   │   ├── cases/page.tsx           # Active investigations
│   │   ├── patterns/page.tsx        # Pattern library
│   │   ├── memory/page.tsx          # Sibyl Memory explorer
│   │   ├── agents/page.tsx          # Agent swarm status
│   │   ├── bounty/new/page.tsx      # Post bounty form
│   │   └── api/                     # REST + polling endpoints
│   ├── components/
│   │   ├── DashboardShell.tsx       # Shared layout shell
│   │   └── AuthGuard.tsx            # SIWE auth gate
│   ├── hooks/
│   │   └── useSIWE.ts              # SIWE sign-in hook
│   └── lib/
│       ├── session.ts               # iron-session config
│       └── auth.ts                  # Auth helpers
├── scripts/
│   └── deploy.ts                    # Hardhat deploy script
├── hardhat.config.ts
└── package.json
```

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Fill in your API keys in .env.local:
# OPENROUTER_API_KEY    — from openrouter.ai
# BASESCAN_API_KEY      — from basescan.org
# SESSION_SECRET        — any 32+ char string
# PRIVATE_KEY           — deployer wallet (for contract deploy only)

# Run the development server
npm run dev
```

### Deploy Bounty Contract (Base Sepolia)

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network base-sepolia
# Set the printed address as NEXT_PUBLIC_BOUNTY_CONTRACT in .env.local
npx hardhat verify --network base-sepolia <contract-address>
```

### Persistent Memory (recommended for production)

**Option A: Upstash Redis** (zero-config, works on Vercel)
```bash
# Create a free database at upstash.com, then set env vars:
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Option B: Sibyl Bridge** (full Sibyl SDK via Python)
```bash
cd sibyl-bridge
pip install -r requirements.txt
python server.py
# Set SIBYL_BRIDGE_URL=http://localhost:4001 in .env.local
```

Memory mode is auto-detected: Redis if `UPSTASH_REDIS_REST_URL` is set, Sibyl bridge if `SIBYL_BRIDGE_URL` is set, in-memory otherwise. Check the mode indicator at `/memory`.

---

## Demo Walkthrough

1. **Connect wallet** — RainbowKit modal, sign SIWE message
2. **Dashboard** — real-time stats: funds traced, cases, agent activity chart
3. **Post a bounty** — enter victim wallet + incident TX, describe the theft
4. **Watch agents investigate** — live polling updates as Tracer → Analyst → Monitor pipeline runs
5. **Browse patterns** — see what the swarm has learned across cases
6. **Sibyl Memory** — explore the shared memory store, search by address or pattern
7. **Memory deletion test** — clear memory at Sibyl Memory page, start a new investigation, watch coordination degrade — proves memory is load-bearing

---

## Prior Work Declaration

This project was built from scratch during the Sibyl Labs Hackathon build window (Sep 1–10, 2026).

Inspired by: Nemesis (wallet investigation concept), Tribunal (onchain bounty/escrow pattern), Eclipse (policy-controlled agent treasury). No code was reused from these projects.

## License

MIT

---

Built for the **Sibyl Labs Hackathon** — September 2026
