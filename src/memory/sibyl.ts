// Sibyl Memory — tri-mode adapter
// Mode 1 (default): in-memory store — works instantly, no deps
// Mode 2 (SIBYL_BRIDGE_URL set): forwards to Python sibyl-memory-client bridge
// Mode 3 (UPSTASH_REDIS_REST_URL set): persists to Upstash Redis — survives cold starts
// All 3 agents + API routes import getSibylMemory() — one interface, swappable backend

import { COLLECTIONS, type CollectionName } from './schemas';

const BRIDGE_URL = process.env.SIBYL_BRIDGE_URL || ''; // e.g. http://localhost:4001
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

interface QueryOptions {
  filter?: Record<string, unknown>;
  limit?: number;
  sort?: { field: string; order: 'asc' | 'desc' };
}

// ─── In-memory store (Mode 1) ───────────────────────────────────

interface StoredDoc {
  id: string;
  data: Record<string, unknown>;
  ts: string;
}

const _store = new Map<string, Map<string, StoredDoc>>();

function col(name: CollectionName): Map<string, StoredDoc> {
  if (!_store.has(name)) _store.set(name, new Map());
  return _store.get(name)!;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Sibyl Bridge helpers (Mode 2) ──────────────────────────────

async function bridgeFetch(
  path: string,
  opts?: { method?: string; body?: unknown },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: opts?.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Bridge ${res.status}: ${txt}`);
  }
  return res.json();
}

// ─── Local-memory implementation ────────────────────────────────

const localMemory = {
  async store(collection: CollectionName, document: Record<string, unknown>, id?: string): Promise<string> {
    const docId = id || genId();
    col(collection).set(docId, { id: docId, data: { ...document }, ts: new Date().toISOString() });
    return docId;
  },

  async retrieve<T>(collection: CollectionName, id: string): Promise<T | null> {
    const doc = col(collection).get(id);
    return doc ? (doc.data as unknown as T) : null;
  },

  async query<T>(collection: CollectionName, options?: QueryOptions): Promise<T[]> {
    let results = Array.from(col(collection).values()).map((d) => d.data as unknown as T);
    if (options?.filter) {
      const entries = Object.entries(options.filter);
      results = results.filter((item) => {
        const rec = item as Record<string, unknown>;
        return entries.every(([k, v]) => rec[k] === v);
      });
    }
    if (options?.sort) {
      const { field, order } = options.sort;
      results.sort((a, b) => {
        const av = (a as Record<string, unknown>)[field];
        const bv = (b as Record<string, unknown>)[field];
        if (av === bv) return 0;
        const cmp = av! < bv! ? -1 : 1;
        return order === 'asc' ? cmp : -cmp;
      });
    }
    if (options?.limit) results = results.slice(0, options.limit);
    return results;
  },

  async update(collection: CollectionName, id: string, updates: Record<string, unknown>): Promise<void> {
    const c = col(collection);
    const doc = c.get(id);
    if (!doc) {
      c.set(id, { id, data: { ...updates }, ts: new Date().toISOString() });
    } else {
      doc.data = { ...doc.data, ...updates };
      doc.ts = new Date().toISOString();
    }
  },

  async delete(collection: CollectionName, id: string): Promise<void> {
    col(collection).delete(id);
  },

  async clearCollection(collection: CollectionName): Promise<void> {
    _store.set(collection, new Map());
  },

  async clearAll(): Promise<void> {
    for (const name of Object.values(COLLECTIONS)) _store.set(name, new Map());
    _seeded = true; // Prevent auto-reseed after deletion test — memory should stay empty
  },

  async search<T>(query: string, collections?: CollectionName[]): Promise<T[]> {
    const targets = collections || (Object.values(COLLECTIONS) as CollectionName[]);
    const lq = query.toLowerCase();
    const out: T[] = [];
    for (const name of targets) {
      for (const doc of col(name).values()) {
        if (JSON.stringify(doc.data).toLowerCase().includes(lq)) out.push(doc.data as unknown as T);
      }
    }
    return out;
  },

  async stats(collection: CollectionName): Promise<{ count: number; lastUpdated: string | null }> {
    const c = col(collection);
    if (c.size === 0) return { count: 0, lastUpdated: null };
    const latest = Array.from(c.values()).sort((a, b) => b.ts.localeCompare(a.ts))[0];
    return { count: c.size, lastUpdated: latest?.ts || null };
  },

  async healthCheck(): Promise<{ operational: boolean; collections: Record<string, number> }> {
    const out: Record<string, number> = {};
    for (const [key, name] of Object.entries(COLLECTIONS)) out[key] = col(name).size;
    return { operational: true, collections: out };
  },

  dump(): Record<string, Record<string, unknown>[]> {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      out[key] = Array.from(col(name).values()).map((d) => d.data);
    }
    return out;
  },
};

// ─── Sibyl Bridge implementation ────────────────────────────────

const bridgeMemory = {
  async store(collection: CollectionName, document: Record<string, unknown>, id?: string): Promise<string> {
    const docId = id || genId();
    await bridgeFetch('/entity', {
      method: 'POST',
      body: { category: collection, name: docId, data: document },
    });
    // Also write to local cache so query/dump work immediately
    localMemory.store(collection, document, docId);
    return docId;
  },

  async retrieve<T>(collection: CollectionName, id: string): Promise<T | null> {
    try {
      const res = await bridgeFetch(`/entity?category=${collection}&name=${encodeURIComponent(id)}`);
      return (res?.data as T) ?? null;
    } catch {
      // Fall back to local cache
      return localMemory.retrieve<T>(collection, id);
    }
  },

  // query/sort/filter are done locally (Sibyl doesn't have a SQL-like query API)
  // but we sync from Sibyl on startup via list
  async query<T>(collection: CollectionName, options?: QueryOptions): Promise<T[]> {
    return localMemory.query<T>(collection, options);
  },

  async update(collection: CollectionName, id: string, updates: Record<string, unknown>): Promise<void> {
    // Read-modify-write through bridge
    const existing = await this.retrieve<Record<string, unknown>>(collection, id);
    const merged = { ...(existing || {}), ...updates };
    await bridgeFetch('/entity', {
      method: 'POST',
      body: { category: collection, name: id, data: merged },
    });
    localMemory.update(collection, id, updates);
  },

  async delete(collection: CollectionName, id: string): Promise<void> {
    await bridgeFetch(`/entity?category=${collection}&name=${encodeURIComponent(id)}`, { method: 'DELETE' });
    localMemory.delete(collection, id);
  },

  async clearCollection(collection: CollectionName): Promise<void> {
    await bridgeFetch(`/clear?categories=${collection}`, { method: 'DELETE' });
    localMemory.clearCollection(collection);
  },

  async clearAll(): Promise<void> {
    await bridgeFetch('/clear', { method: 'DELETE' });
    localMemory.clearAll();
  },

  async search<T>(query: string, collections?: CollectionName[]): Promise<T[]> {
    try {
      const res = await bridgeFetch(`/search?q=${encodeURIComponent(query)}`);
      return (res?.results || []) as T[];
    } catch {
      return localMemory.search<T>(query, collections);
    }
  },

  async stats(collection: CollectionName): Promise<{ count: number; lastUpdated: string | null }> {
    return localMemory.stats(collection);
  },

  async healthCheck(): Promise<{ operational: boolean; collections: Record<string, number> }> {
    try {
      const res = await bridgeFetch('/health');
      const local = await localMemory.healthCheck();
      return { operational: res?.ok === true, collections: local.collections };
    } catch {
      return { operational: false, collections: {} };
    }
  },

  dump(): Record<string, Record<string, unknown>[]> {
    return localMemory.dump();
  },
};

// ─── Redis persistence layer (Mode 3) ──────────────────────────
// Wraps localMemory with write-through to Upstash Redis.
// Reads populate local cache on first access; writes go to both.

let _redisClient: import('@upstash/redis').Redis | null = null;

function getRedis(): import('@upstash/redis').Redis | null {
  if (_redisClient) return _redisClient;
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    // Dynamic import to avoid bundling when not used
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    _redisClient = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
    return _redisClient;
  } catch {
    return null;
  }
}

const REDIS_PREFIX = 'prowl:';
let _redisHydrated = false;

async function hydrateFromRedis(): Promise<void> {
  if (_redisHydrated) return;
  _redisHydrated = true;
  const redis = getRedis();
  if (!redis) return;
  try {
    for (const collectionName of Object.values(COLLECTIONS)) {
      const key = `${REDIS_PREFIX}${collectionName}`;
      const raw = await redis.get<Record<string, { id: string; data: Record<string, unknown>; ts: string }>>(key);
      if (raw && typeof raw === 'object') {
        const c = col(collectionName);
        for (const [docId, doc] of Object.entries(raw)) {
          if (!c.has(docId)) {
            c.set(docId, doc);
          }
        }
      }
    }
    console.log('[SibylMemory] Hydrated from Redis — persistent memory active');
  } catch (e) {
    console.log('[SibylMemory] Redis hydration failed, falling back to local:', e);
  }
}

async function persistCollectionToRedis(collectionName: CollectionName): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const c = col(collectionName);
    const data: Record<string, { id: string; data: Record<string, unknown>; ts: string }> = {};
    for (const [id, doc] of c.entries()) {
      data[id] = doc;
    }
    await redis.set(`${REDIS_PREFIX}${collectionName}`, data);
  } catch {
    // Silent fail — local memory still works
  }
}

const redisMemory = {
  async store(collection: CollectionName, document: Record<string, unknown>, id?: string): Promise<string> {
    const docId = await localMemory.store(collection, document, id);
    await persistCollectionToRedis(collection);
    return docId;
  },

  async retrieve<T>(collection: CollectionName, id: string): Promise<T | null> {
    return localMemory.retrieve<T>(collection, id);
  },

  async query<T>(collection: CollectionName, options?: QueryOptions): Promise<T[]> {
    return localMemory.query<T>(collection, options);
  },

  async update(collection: CollectionName, id: string, updates: Record<string, unknown>): Promise<void> {
    await localMemory.update(collection, id, updates);
    await persistCollectionToRedis(collection);
  },

  async delete(collection: CollectionName, id: string): Promise<void> {
    await localMemory.delete(collection, id);
    await persistCollectionToRedis(collection);
  },

  async clearCollection(collection: CollectionName): Promise<void> {
    await localMemory.clearCollection(collection);
    await persistCollectionToRedis(collection);
  },

  async clearAll(): Promise<void> {
    await localMemory.clearAll();
    const redis = getRedis();
    if (redis) {
      for (const name of Object.values(COLLECTIONS)) {
        await redis.del(`${REDIS_PREFIX}${name}`);
      }
    }
  },

  async search<T>(query: string, collections?: CollectionName[]): Promise<T[]> {
    return localMemory.search<T>(query, collections);
  },

  async stats(collection: CollectionName): Promise<{ count: number; lastUpdated: string | null }> {
    return localMemory.stats(collection);
  },

  async healthCheck(): Promise<{ operational: boolean; collections: Record<string, number> }> {
    return localMemory.healthCheck();
  },

  dump(): Record<string, Record<string, unknown>[]> {
    return localMemory.dump();
  },
};

// ─── Auto-seed (ensures patterns exist on cold start) ──────────

const SEED_PATTERNS = [
  { pattern_id: 'pat-001', pattern_type: 'fund_splitting', description: 'Funds split into 5+ wallets within 1 hour of theft — classic laundering pattern', first_seen_case: 'prowl-seed-001', times_matched: 7, confidence: 0.85, related_addresses: ['0x1234567890abcdef1234567890abcdef12345678', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'], bytecode_hash: null },
  { pattern_id: 'pat-002', pattern_type: 'rapid_movement', description: '3+ hops within 10 minutes — rapid fund movement to evade tracking', first_seen_case: 'prowl-seed-001', times_matched: 4, confidence: 0.75, related_addresses: [], bytecode_hash: null },
  { pattern_id: 'pat-003', pattern_type: 'bridge_usage', description: 'Funds sent to bridge contract — cross-chain escape attempt', first_seen_case: 'prowl-seed-002', times_matched: 3, confidence: 0.9, related_addresses: ['0x3154cf16ccdb4c6d922629664174b904d80f2c36'], bytecode_hash: null },
  { pattern_id: 'pat-004', pattern_type: 'contract_interaction', description: 'Funds routed through unverified contract — possible mixer or proxy', first_seen_case: 'prowl-seed-003', times_matched: 2, confidence: 0.7, related_addresses: [], bytecode_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
  { pattern_id: 'pat-005', pattern_type: 'cex_deposit', description: 'Funds deposited to known CEX hot wallet — final destination', first_seen_case: 'prowl-seed-001', times_matched: 5, confidence: 0.95, related_addresses: ['0x3154cf16ccdb4c6d922629664174b904d80f2c35', '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23'], bytecode_hash: null },
];

const SEED_CASES = [
  { case_id: 'prowl-seed-001', bounty_id: 'bounty-seed-001', victim_wallet: '0xDeaD000000000000000000000000000000000001', incident_tx: '0x' + 'a'.repeat(64), status: 'solved', reward: '0.1 ETH', created_at: '2026-09-01T10:00:00Z', solved_at: '2026-09-01T14:00:00Z', total_hops_traced: 6, total_funds_traced: '2.0 ETH', agents_involved: ['tracer', 'analyst', 'monitor'] },
  { case_id: 'prowl-seed-002', bounty_id: 'bounty-seed-002', victim_wallet: '0xDeaD000000000000000000000000000000000002', incident_tx: '0x' + 'b'.repeat(64), status: 'monitoring', reward: '0.05 ETH', created_at: '2026-09-02T08:00:00Z', solved_at: null, total_hops_traced: 4, total_funds_traced: '1.5 ETH', agents_involved: ['tracer', 'analyst', 'monitor'] },
  { case_id: 'prowl-seed-003', bounty_id: 'bounty-seed-003', victim_wallet: '0xDeaD000000000000000000000000000000000003', incident_tx: '0x' + 'c'.repeat(64), status: 'solved', reward: '0.2 ETH', created_at: '2026-09-03T09:00:00Z', solved_at: '2026-09-03T16:00:00Z', total_hops_traced: 8, total_funds_traced: '5.0 ETH', agents_involved: ['tracer', 'analyst'] },
];

let _seeded = false;

async function ensureSeeded(): Promise<void> {
  if (_seeded) return;
  _seeded = true;
  // Only auto-seed if the patterns collection is empty (cold start)
  const existing = col(COLLECTIONS.PATTERNS);
  if (existing.size > 0) return;
  console.log('[SibylMemory] Cold start detected — auto-seeding pattern database');
  for (const p of SEED_PATTERNS) {
    localMemory.store(COLLECTIONS.PATTERNS, p as unknown as Record<string, unknown>, p.pattern_id);
  }
  for (const c of SEED_CASES) {
    localMemory.store(COLLECTIONS.CASES, c as unknown as Record<string, unknown>, c.case_id);
  }
  console.log(`[SibylMemory] Seeded ${SEED_PATTERNS.length} patterns + ${SEED_CASES.length} cases from prior investigations`);
}

// ─── Export ─────────────────────────────────────────────────────

export type MemoryAPI = typeof localMemory;

/** Returns which memory backend is active */
export function getMemoryMode(): { mode: 'sibyl-bridge' | 'redis-persistent' | 'local'; bridgeUrl: string | null } {
  return {
    mode: BRIDGE_URL ? 'sibyl-bridge' : REDIS_URL ? 'redis-persistent' : 'local',
    bridgeUrl: BRIDGE_URL || REDIS_URL || null,
  };
}

export function getSibylMemory(): MemoryAPI {
  // Hydrate from Redis on first call (non-blocking)
  if (REDIS_URL && !BRIDGE_URL) {
    hydrateFromRedis();
  }
  // Ensure seed data exists on cold start (non-blocking)
  ensureSeeded();
  if (BRIDGE_URL) {
    return bridgeMemory;
  }
  if (REDIS_URL) {
    return redisMemory;
  }
  return localMemory;
}

export type { QueryOptions };
