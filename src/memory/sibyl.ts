// Sibyl Memory — dual-mode adapter (local dev + real Sibyl bridge)
// Sibyl Memory — unified interface
// Mode 1 (default): in-memory store — works instantly, no deps
// Mode 2 (SIBYL_BRIDGE_URL set): forwards to Python sibyl-memory-client bridge
// All 3 agents + API routes import getSibylMemory() — one interface, swappable backend

import { COLLECTIONS, type CollectionName } from './schemas';

const BRIDGE_URL = process.env.SIBYL_BRIDGE_URL || ''; // e.g. http://localhost:4001

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
    console.log(`[Memory] stored  ${collection}/${docId}`);
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
    console.log(`[Memory] updated ${collection}/${id}`);
  },

  async delete(collection: CollectionName, id: string): Promise<void> {
    col(collection).delete(id);
  },

  async clearCollection(collection: CollectionName): Promise<void> {
    _store.set(collection, new Map());
    console.log(`[Memory] cleared ${collection}`);
  },

  async clearAll(): Promise<void> {
    for (const name of Object.values(COLLECTIONS)) _store.set(name, new Map());
    console.log('[Memory] ALL CLEARED — agents cannot coordinate');
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
    console.log(`[Sibyl] stored  ${collection}/${docId}`);
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
    console.log(`[Sibyl] updated ${collection}/${id}`);
  },

  async delete(collection: CollectionName, id: string): Promise<void> {
    await bridgeFetch(`/entity?category=${collection}&name=${encodeURIComponent(id)}`, { method: 'DELETE' });
    localMemory.delete(collection, id);
  },

  async clearCollection(collection: CollectionName): Promise<void> {
    await bridgeFetch(`/clear?categories=${collection}`, { method: 'DELETE' });
    localMemory.clearCollection(collection);
    console.log(`[Sibyl] cleared ${collection}`);
  },

  async clearAll(): Promise<void> {
    await bridgeFetch('/clear', { method: 'DELETE' });
    localMemory.clearAll();
    console.log('[Sibyl] ALL CLEARED — agents cannot coordinate');
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

// ─── Export ─────────────────────────────────────────────────────

export type MemoryAPI = typeof localMemory;

export function getSibylMemory(): MemoryAPI {
  if (BRIDGE_URL) {
    console.log(`[Memory] Using Sibyl bridge at ${BRIDGE_URL}`);
    return bridgeMemory;
  }
  return localMemory;
}

export type { QueryOptions };
