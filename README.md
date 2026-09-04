# Prowl

**An AI investigation swarm that traces stolen crypto on Base.**

Four agents coordinate *through* Sibyl Memory to solve onchain bounties. What one case learns, the next one starts with.

| | |
|---|---|
| **Live** | [prowl-ebon.vercel.app](https://prowl-ebon.vercel.app) |
| **Contract** | [`0x472fd94B2444Dd549E1f2847fa9039d46eCB906D`](https://sepolia.basescan.org/address/0x472fd94B2444Dd549E1f2847fa9039d46eCB906D) — Base Sepolia, verified |
| **Treasury** | `0x21fc67258Dd145C0C39bd87B3ECa9C2508A48F65` |
| **Tests** | 47 passing — 20 unit + 27 contract |
| **Tracing** | Base **mainnet** (real theft data) · escrow on Base Sepolia |

---

## Verify this in 60 seconds

Every claim below is checkable. Start here:

```bash
npm ci && npm test
```

That runs 20 unit tests and 27 Solidity tests. Two of the unit tests are the load-bearing-memory proof described in the next section — they run the **real** `TracerAgent` twice over identical chain data and assert the outcome changes based only on memory contents.

```bash
npx vitest run src/__tests__/tracer-memory.test.ts
```

---

## Where memory is load-bearing

Memory is not a log the agents write to. It is the **only channel they talk through** — there is no direct call path between agents anywhere in this codebase. Cut memory and they cannot hand work to each other at all.

| Step | Agent | Operation | Code |
|---|---|---|---|
| 1 | Tracer | **writes** hops | [`tracer.ts:460`](src/agents/tracer.ts#L460) |
| 2 | Analyst | **reads** those hops | [`analyst.ts:28`](src/agents/analyst.ts#L28) |
| 3 | Analyst | **writes** analyses + patterns | [`analyst.ts:81`](src/agents/analyst.ts#L81), [`:90`](src/agents/analyst.ts#L90) |
| 4 | Monitor | **reads** dead ends, **writes** watchlist | [`monitor.ts:26`](src/agents/monitor.ts#L26), [`:69`](src/agents/monitor.ts#L69) |
| 5 | Tracer | **reads** past analyses on the *next* case | [`tracer.ts:467`](src/agents/tracer.ts#L467) |

Step 5 closes the loop, and it is the part that matters.

### Memory changes what the Tracer does

`loadMemoryDirectives()` ([`tracer.ts:467`](src/agents/tracer.ts#L467)) reads **every prior analysis across all cases** — not just the current one — and builds two sets:

- **prioritize** — addresses flagged high-risk before, or seen in 2+ cases
- **skip** — addresses with an explicit, evidence-backed `verified_service` directive

Those sets drive branch selection at [`tracer.ts:261`](src/agents/tracer.ts#L261). Concretely:

> **Without memory**, the Tracer follows the largest transfer.
> **With memory**, it follows a known drainer *first* — even when that branch is 10× smaller.

This is asserted, not claimed: [`tracer-memory.test.ts`](src/__tests__/tracer-memory.test.ts) mocks the chain reader, runs the real agent twice over the same three candidate branches, and checks the first traced hop flips from the 5 ETH branch to the 0.5 ETH known drainer.

### Deleting memory measurably degrades the swarm

`Clear data` at `/memory` wipes every collection. The pipeline then emits real degradation warnings rather than failing silently:

- `memoryDegraded` is computed at [`analyst.ts:49`](src/agents/analyst.ts#L49) and surfaced to the UI at [`coordinator.ts:139`](src/agents/coordinator.ts#L139)
- Tracer logs `NO_MEMORY: Operating without cross-case intelligence`
- Cross-case correlation, pattern matching and watchlists all return empty

A second test asserts the wipe actually removes the intelligence rather than just blanking a display.

### What it looks like working

From a real investigation in the demo — the Analyst recognising the drainer with no prompting:

> *"This case reveals a structured laundering network centered on `0x77dd9A93…`, which appears as a recipient in **10 separate theft cases**, confirming it as a repeat endpoint for washed funds."* — 99% confidence

Those ten case IDs are prior Prowl investigations. The pattern library learned `fund_splitting` and `rapid_movement` from earlier cases and matched them here automatically.

---

## The four agents

| Agent | Role | What it actually does |
|---|---|---|
| **Coordinator** | Case lead | Opens the case, sequences the pipeline, writes the report |
| **Tracer** | Flow analysis | Walks the money hop by hop; branch order driven by memory |
| **Analyst** | Pattern matching | Correlates across cases, scores risk, emits directives for future traces |
| **Monitor** | Surveillance | Watches dead-end wallets, resumes tracing when funds move |

**Flow:** bounty posted → Coordinator assigns Tracer → Tracer writes hops → Analyst reads them, matches patterns, writes analyses → Monitor watches dead ends → reward released from escrow (95% agent / 5% protocol).

---

## Architecture

```
Next.js frontend  ──polling──▶  API routes  ──▶  Coordinator
                                                     │
                            ┌────────────┬───────────┴┐
                            ▼            ▼            ▼
                         Tracer       Analyst      Monitor
                            └────────────┴────────────┘
                                         │
                              ▼ the only channel between them ▼
                              ┌────────────────────────┐
                              │     Sibyl Memory       │
                              │  cases · hops · patterns │
                              │  watchlist · analysis  │
                              └────────────────────────┘
                                         │
                   Base mainnet (tracing) · Base Sepolia (escrow)
```

**Memory backends** — one interface, auto-detected ([`src/memory/sibyl.ts`](src/memory/sibyl.ts)):

| Mode | Trigger | Notes |
|---|---|---|
| Local | default | in-process Map, zero setup |
| Redis | `UPSTASH_REDIS_REST_URL` | survives cold starts |
| Sibyl Bridge | `SIBYL_BRIDGE_URL` | real `sibyl-memory-client` SDK via Python bridge |
| Dual | both set | write-through to all three |

Production runs **Dual**. The bridge ([`sibyl-bridge/server.py`](sibyl-bridge/server.py)) uses `MemoryClient.local()` from the genuine Sibyl SDK and raises on failure — there is no silent fallback, so anything working is going through Sibyl.

---

## Tech stack

- **Framework** — Next.js 16 (App Router), React 19, TypeScript
- **Memory** — Sibyl Memory SDK via Python bridge, Redis write-through
- **AI** — OpenRouter (DeepSeek). Load-bearing in two places: branch prioritisation ([`tracer.ts`](src/agents/tracer.ts)) and threat assessment ([`analyst.ts`](src/agents/analyst.ts)) — not just summary polish
- **Chain** — Base mainnet via Blockscout V2 with V1 fallback, viem
- **Contracts** — Solidity 0.8.20, Hardhat, 27 tests
- **Auth** — SIWE + iron-session encrypted cookies

---

## Revenue model

Enforced onchain by [`ProwlBounty.sol`](contracts/BountyContract.sol). Every path is tested.

| Event | Outcome | Function |
|---|---|---|
| Bounty posted | Reward locked in escrow | `postBounty` |
| Agent claims | Stake escrowed **per bounty** | `claimBounty` |
| Case solved | 95% + stake to agent, **5% fee** to treasury | `approvePayout` |
| Poster silent 7 days | Auto-approves, same terms | `resolveTimeout` |
| Never claimed | Full refund to poster | `cancelBounty` |
| Claimed, abandoned 3 days | Reward **+ forfeited stake** to poster | `reclaimAbandoned` |
| Report disputed | Treasury arbitrates both ways | `resolveDispute` |

Stakes are keyed by bounty (`bountyStakes[bountyId]`), never pooled per agent — so settling one bounty can never draw on another's escrow. That specific invariant has a regression test.

No subscription, no upfront cost. Cross-case memory compounds: each solved case enriches the pattern database, which shortens the next investigation.

---

## Setup

```bash
npm ci
cp .env.example .env.local     # fill in OPENROUTER_API_KEY, SESSION_SECRET
npm run dev
```

Optional persistence:

```bash
# Redis (zero-config on Vercel)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# or the full Sibyl SDK
cd sibyl-bridge && pip install -r requirements.txt && python server.py
# then set SIBYL_BRIDGE_URL
```

Deploy the contract:

```bash
npx hardhat test
npx hardhat run scripts/deploy.ts --network base-sepolia
npx hardhat verify --network base-sepolia <address> <treasury>
```

---

## Demo walkthrough

1. Connect wallet (SIWE)
2. **Post a bounty** — victim wallet, suspect address, incident tx; ETH locked in escrow onchain
3. **Watch the swarm** — live feed as Tracer → Analyst → Monitor run
4. **Fund graph** — the theft as a graph: splits, dead ends, contract destinations
5. **Analysis** — cross-case recall: *"appeared in N prior theft cases"*
6. **Sibyl Memory** — every trace the swarm has stored
7. **Clear data**, re-run — watch coordination degrade

---

## Known limitations

Stated plainly, because a report that hides them is worth less than one that doesn't.

- **ERC-20 incident transactions show `0 ETH` at hop 0.** A token transfer carries `value: 0` on the top-level tx; the amount lives in the logs. Outgoing token transfers *are* traced — the origin hop amount is the gap.
- **Terminal hops can lose their asset label**, so a token trace may report totals under both ETH and USDC. Affects the displayed total, not the trail.
- **The known-address table is deliberately small** ([`reader.ts`](src/chain/reader.ts)) — only addresses verifiable on Base. An earlier revision carried mainnet Ethereum hot wallets and one fabricated address; a wrong `terminal: true` ends an investigation at the wrong wallet, so unverified entries were removed rather than kept. The CEX section is intentionally empty and extensible via `KNOWN_ADDRESSES_EXTRA`. Consequence: `exchange_found` rarely fires on live data, and traces honestly end in dead ends.
- **The AI summary can fail** (rate limit / timeout). Rule-based analysis continues; the report shows the gap rather than inventing text.
- **Escrow is Base Sepolia**, tracing is Base mainnet. Deliberate — real theft data, testnet money.

---

## Prior work declaration

Built from scratch during the Sibyl Labs Hackathon window (Sep 1–10, 2026).

Inspired by Nemesis (wallet investigation), Tribunal (onchain escrow), Eclipse (agent treasury). No code reused.

## License

MIT

---

Built for the **Sibyl Labs Hackathon** — September 2026
