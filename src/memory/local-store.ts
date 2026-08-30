// Local in-memory store for development/demo
// Drop-in replacement for Sibyl Memory API when developing offline
// This gets swapped for real Sibyl in production

import { COLLECTIONS, type CollectionName } from './schemas';

interface StoredDocument {
  id: string;
  data: Record<string, unknown>;
  timestamp: string;
  updated_at?: string;
}

class LocalMemoryStore {
  private store: Map<string, Map<string, StoredDocument>> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    for (const collection of Object.values(COLLECTIONS)) {
      this.store.set(collection, new Map());
    }

    this.initialized = true;
    console.log('[LocalStore] Memory initialized (development mode)');
  }

  async store_doc<T extends Record<string, unknown>>(
    collection: CollectionName,
    document: T,
    id?: string
  ): Promise<string> {
    const docId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const col = this.getCollection(collection);

    col.set(docId, {
      id: docId,
      data: document,
      timestamp: new Date().toISOString(),
    });

    console.log(`[LocalStore] Stored in ${collection}: ${docId}`);
    return docId;
  }

  async retrieve<T>(collection: CollectionName, id: string): Promise<T | null> {
    const col = this.getCollection(collection);
    const doc = col.get(id);
    return doc ? (doc.data as unknown as T) : null;
  }

  async query<T>(
    collection: CollectionName,
    options?: { filter?: Record<string, unknown>; limit?: number; sort?: { field: string; order: 'asc' | 'desc' } }
  ): Promise<T[]> {
    const col = this.getCollection(collection);
    let results = Array.from(col.values()).map((doc) => doc.data as unknown as T);

    // Apply filter
    if (options?.filter) {
      results = results.filter((item) => {
        const record = item as Record<string, unknown>;
        return Object.entries(options.filter!).every(
          ([key, value]) => record[key] === value
        );
      });
    }

    // Apply sort
    if (options?.sort) {
      const { field, order } = options.sort;
      results.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field];
        const bVal = (b as Record<string, unknown>)[field];
        if (aVal === bVal) return 0;
        const cmp = aVal! < bVal! ? -1 : 1;
        return order === 'asc' ? cmp : -cmp;
      });
    }

    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async update<T extends Record<string, unknown>>(
    collection: CollectionName,
    id: string,
    updates: Partial<T>
  ): Promise<void> {
    const col = this.getCollection(collection);
    const doc = col.get(id);
    if (!doc) throw new Error(`Document ${id} not found in ${collection}`);

    doc.data = { ...doc.data, ...updates };
    doc.updated_at = new Date().toISOString();
    col.set(id, doc);
  }

  async delete(collection: CollectionName, id: string): Promise<void> {
    const col = this.getCollection(collection);
    col.delete(id);
  }

  async clearCollection(collection: CollectionName): Promise<void> {
    this.store.set(collection, new Map());
    console.log(`[LocalStore] Cleared collection: ${collection}`);
  }

  async clearAll(): Promise<void> {
    for (const collection of Object.values(COLLECTIONS)) {
      this.store.set(collection, new Map());
    }
    console.log('[LocalStore] ALL MEMORY CLEARED');
  }

  async search<T>(query: string, collections?: CollectionName[]): Promise<T[]> {
    const targets = collections || (Object.values(COLLECTIONS) as CollectionName[]);
    const results: T[] = [];
    const lowerQuery = query.toLowerCase();

    for (const collection of targets) {
      const col = this.getCollection(collection);
      for (const doc of col.values()) {
        const str = JSON.stringify(doc.data).toLowerCase();
        if (str.includes(lowerQuery)) {
          results.push(doc.data as unknown as T);
        }
      }
    }

    return results;
  }

  async stats(collection: CollectionName): Promise<{ count: number; lastUpdated: string | null }> {
    const col = this.getCollection(collection);
    const docs = Array.from(col.values());
    const lastDoc = docs.sort((a, b) =>
      (b.updated_at || b.timestamp).localeCompare(a.updated_at || a.timestamp)
    )[0];

    return {
      count: col.size,
      lastUpdated: lastDoc?.updated_at || lastDoc?.timestamp || null,
    };
  }

  async healthCheck(): Promise<{
    operational: boolean;
    collections: Record<string, number>;
  }> {
    const collections: Record<string, number> = {};
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      const col = this.store.get(name);
      collections[key] = col ? col.size : -1;
    }
    return { operational: true, collections };
  }

  // Get raw data for debug view
  getAllData(): Record<string, Record<string, unknown>[]> {
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const [name, col] of this.store.entries()) {
      data[name] = Array.from(col.values()).map((d) => d.data);
    }
    return data;
  }

  private getCollection(name: CollectionName): Map<string, StoredDocument> {
    if (!this.store.has(name)) {
      this.store.set(name, new Map());
    }
    return this.store.get(name)!;
  }
}

// Singleton
let localStore: LocalMemoryStore | null = null;

export function getLocalStore(): LocalMemoryStore {
  if (!localStore) {
    localStore = new LocalMemoryStore();
  }
  return localStore;
}

export { LocalMemoryStore };
