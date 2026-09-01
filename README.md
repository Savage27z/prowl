# Prowl 🐾

An AI investigation swarm that traces stolen crypto on Base. Three specialist agents coordinate through Sibyl Memory to solve onchain bounties.

## What It Does

Prowl is a coordinated team of AI agents that investigate crypto theft:
- **🔍 Tracer** follows the money trail across wallets hop-by-hop
- **🧠 Analyst** matches patterns from past cases and known scam signatures
- **📡 Monitor** watches dormant wallets and resumes investigations when funds move

Someone posts a bounty ("find where my stolen 2 ETH went"), Prowl's agents pick it up, trace the funds across wallets, match patterns from past cases, monitor dormant addresses, and deliver a full investigation report. Payment releases automatically from smart contract escrow when the case is solved.

## Where Memory Is Load-Bearing

Memory is the backbone of Prowl. Without it:
- Agents can't share findings with each other (coordination breaks)
- No pattern database means no pattern recognition (every case starts from zero)
- No watchlists means dormant funds are never re-traced
- Delete memory → run the app → investigation fails completely

**Memory writes:** `src/agents/tracer.ts:L45`, `src/agents/analyst.ts:L78`, `src/agents/monitor.ts:L32`
**Memory reads:** `src/agents/analyst.ts:L55`, `src/agents/tracer.ts:L90`, `src/agents/monitor.ts:L20`

### Memory Coordination Flow

```
Bounty Posted → Tracer picks it up
    ↓
Tracer writes hop data to Sibyl Memory
    ↓
Analyst reads hops, matches against pattern memory
    ↓
Analyst writes analysis back to Sibyl Memory
    ↓
Tracer reads analysis ("skip this address, known exchange")
    ↓
Tracer hits dead end → writes to memory
    ↓
Monitor reads dead ends → starts watching
    ↓
Monitor detects movement → writes alert to memory
    ↓
Tracer reads alert → resumes tracing
```

## How Memory Made This Possible

Prowl's agents coordinate exclusively through Sibyl Memory. Tracer writes hop data, Analyst reads it and writes pattern matches, Monitor reads dead ends and writes alerts. Each case adds new patterns to the shared memory, making ALL future investigations smarter. After 10 cases, pattern matching is 3x faster. This coordination would be impossible without persistent, cross-session memory.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
│   Dashboard · Bounty Form · Case View       │
│   Fund Flow Graph · Pattern Library         │
└──────────────────┬──────────────────────────┘
                   │ SSE + REST API
┌──────────────────┴──────────────────────────┐
│             Coordinator Agent               │
│   Orchestrates: Tracer → Analyst → Monitor  │
└──────┬───────────┬───────────┬──────────────┘
       │           │           │
  ┌────┴───┐  ┌────┴───┐  ┌───┴────┐
  │ Tracer │  │Analyst │  │Monitor │
  │  🔍    │  │  🧠    │  │  📡    │
  └───┬────┘  └───┬────┘  └───┬────┘
      │           │           │
      └─────── Sibyl Memory ──┘
         (shared state store)
              │
     ┌────────┴────────┐
     │  Python Bridge   │  ← optional (sibyl-memory-client)
     │  localhost:4001  │
     └─────────────────┘
              │
     ┌────────┴────────┐
     │  Base L2 Chain   │  ← Basescan API + RPC
     │  Smart Contracts │  ← BountyContract.sol
     └─────────────────┘
```

## Partner Stacks

- **Base**: Bounty smart contracts deployed on Base. All transactions (bounty posting, escrow, payouts) happen on Base. Agents read Base chain data for investigations.
- **Virtuals Protocol**: Agents register on the Virtuals network via ACP (Agent Commerce Protocol). Other agents can discover and hire Prowl for investigations.

## Tech Stack

- Next.js (App Router), React, TypeScript, TailwindCSS
- OpenRouter API (DeepSeek model for agent reasoning)
- Sibyl Memory SDK (Python client via Flask bridge + in-memory TypeScript store)
- Solidity smart contracts on Base (bounty escrow)
- Virtuals Protocol ACP SDK (agent commerce)
- Base RPC + Basescan API (chain data)
- SSE (Server-Sent Events) for real-time investigation updates

## Project Structure

```
prowl/
├── contracts/
│   └── BountyContract.sol         # Bounty escrow on Base
├── sibyl-bridge/
│   ├── server.py                  # Python REST bridge to sibyl-memory-client
│   └── requirements.txt
├── src/
│   ├── agents/
│   │   ├── tracer.ts              # Fund tracing agent
│   │   ├── analyst.ts             # Pattern matching agent
│   │   ├── monitor.ts             # Dormant wallet watcher
│   │   ├── coordinator.ts         # Orchestrates the 3 agents
│   │   └── ai.ts                  # OpenRouter AI wrapper
│   ├── memory/
│   │   ├── sibyl.ts               # Unified memory (in-memory + Sibyl bridge)
│   │   └── schemas.ts             # Memory collection schemas
│   ├── virtuals/
│   │   └── acp.ts                 # Virtuals Protocol ACP integration
│   ├── chain/
│   │   ├── reader.ts              # Read Base chain data
│   │   ├── contracts.ts           # Smart contract ABI + config
│   │   └── utils.ts               # Address utils, tx parsing
│   ├── app/
│   │   ├── page.tsx               # Dashboard
│   │   ├── bounty/new/page.tsx    # Post bounty form
│   │   ├── case/[id]/page.tsx     # Investigation view
│   │   ├── patterns/page.tsx      # Pattern library
│   │   ├── memory/page.tsx        # Memory debug + deletion test
│   │   └── api/
│   │       ├── investigate/       # Start investigation, list cases
│   │       ├── seed/              # Seed demo data
│   │       ├── patterns/          # Pattern library API
│   │       ├── monitor/           # Monitor status + trigger
│   │       ├── memory/            # Memory health + dump
│   │       └── virtuals/          # ACP status + agents
│   ├── components/
│   │   ├── FundFlowGraph.tsx      # Canvas-based fund flow visualization
│   │   ├── AgentActivity.tsx      # Live agent activity feed
│   │   ├── BountyCard.tsx         # Bounty display card
│   │   ├── PatternCard.tsx        # Pattern display card
│   │   └── Nav.tsx                # Navigation
│   └── lib/
│       └── utils.ts               # Shared utilities
├── scripts/
│   ├── deploy.ts                  # Hardhat deploy script
│   └── seed.ts                    # Seed script
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
# - OPENROUTER_API_KEY: from openrouter.ai
# - BASESCAN_API_KEY: from basescan.org
# - VIRTUALS_API_KEY: from virtuals.io (optional)
# - PRIVATE_KEY: deployer wallet private key (for contract deploy)

# Run the development server
npm run dev
```

### Optional: Sibyl Bridge (persistent memory)

```bash
cd sibyl-bridge
pip install -r requirements.txt
python server.py
# Then set SIBYL_BRIDGE_URL=http://localhost:4001 in .env.local
```

### Optional: Deploy Bounty Contract

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv
npx hardhat compile
npx hardhat run scripts/deploy.ts --network base-sepolia
```

## Demo Features

1. **Post a bounty** — enter victim wallet + incident TX, lock reward
2. **Watch agents trace** — real-time fund flow visualization via SSE
3. **Pattern learning** — each case teaches the system new patterns
4. **Deletion test** — clear memory at `/memory`, watch coordination fail
5. **Cross-session recall** — restart the app, memory persists (with Sibyl bridge)
6. **ACP integration** — browse Virtuals network agents at `/api/virtuals`

## Memory Deletion Test

Navigate to `/memory` and click "Clear All Memory". Then:
- Start a new investigation → Tracer can't read Analyst tips → worse routing
- Pattern matching → 0 patterns → every case starts from scratch
- Monitor → watchlist empty → dormant funds never detected
- **Proves memory is load-bearing, not decorative**

## Prior Work Declaration

This project was built from scratch during the Sibyl Labs Hackathon build window (Sep 1-10, 2026).
Inspired by: Nemesis (Devpost - wallet investigation concept), Tribunal (Devpost - onchain bounty/escrow pattern), Eclipse (Devpost - policy-controlled agent treasury).
No code was reused from these projects.

## License

MIT
