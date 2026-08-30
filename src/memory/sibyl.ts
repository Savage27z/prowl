// Sibyl Memory SDK wrapper
// Abstraction layer over Sibyl Memory REST API
// Swap implementation when official JS SDK is available

import { COLLECTIONS, type CollectionName } from './schemas';

interface SibylConfig {
  apiKey: string;
  endpoint: string;
}

interface QueryOptions {
  filter?: Record<string, unknown>;
  limit?: number;
  sort?: { field: string; order: 'asc' | 'desc' };
}

class SibylMemory {
  private config: SibylConfig;
  private initialized = false;

  constructor(config?: Partial<SibylConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.SIBYL_API_KEY || '',
      endpoint: config?.endpoint || process.env.SIBYL_ENDPOINT || 'https://api.sibyllabs.org',
    };
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize collections
    for (const collection of Object.values(COLLECTIONS)) {
      await this.ensureCollection(collection);
    }

    this.initialized = true;
    console.log('[Sibyl] Memory initialized with collections:', Object.values(COLLECTIONS));
  }

  private async ensureCollection(name: string): Promise<void> {
    try {
      await this.request('POST', `/collections`, { name, type: 'document' });
    } catch {
      // Collection may already exist
    }
  }

  // Store a document in a collection
  async store<T extends Record<string, unknown>>(
    collection: CollectionName,
    document: T,
    id?: string
  ): Promise<string> {
    const docId = id || this.generateId();
    const result = await this.request('POST', `/collections/${collection}/documents`, {
      id: docId,
      data: document,
      timestamp: new Date().toISOString(),
    });
    console.log(`[Sibyl] Stored document in ${collection}: ${docId}`);
    return result?.id || docId;
  }

  // Retrieve a document by ID
  async retrieve<T>(collection: CollectionName, id: string): Promise<T | null> {
    try {
      const result = await this.request('GET', `/collections/${collection}/documents/${id}`);
      return result?.data as T || null;
    } catch {
      return null;
    }
  }

  // Query documents in a collection
  async query<T>(collection: CollectionName, options?: QueryOptions): Promise<T[]> {
    const params = new URLSearchParams();
    if (options?.filter) params.set('filter', JSON.stringify(options.filter));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.sort) params.set('sort', `${options.sort.field}:${options.sort.order}`);

    const result = await this.request('GET', `/collections/${collection}/documents?${params}`);
    return (result?.documents || []).map((doc: { data: T }) => doc.data);
  }

  // Update a document
  async update<T extends Record<string, unknown>>(
    collection: CollectionName,
    id: string,
    updates: Partial<T>
  ): Promise<void> {
    await this.request('PATCH', `/collections/${collection}/documents/${id}`, {
      data: updates,
      updated_at: new Date().toISOString(),
    });
    console.log(`[Sibyl] Updated document in ${collection}: ${id}`);
  }

  // Delete a document
  async delete(collection: CollectionName, id: string): Promise<void> {
    await this.request('DELETE', `/collections/${collection}/documents/${id}`);
    console.log(`[Sibyl] Deleted document from ${collection}: ${id}`);
  }

  // Clear all data from a collection (for deletion test demo)
  async clearCollection(collection: CollectionName): Promise<void> {
    await this.request('DELETE', `/collections/${collection}/documents`);
    console.log(`[Sibyl] Cleared collection: ${collection}`);
  }

  // Clear ALL memory (for deletion test demo)
  async clearAll(): Promise<void> {
    for (const collection of Object.values(COLLECTIONS)) {
      await this.clearCollection(collection);
    }
    console.log('[Sibyl] ALL MEMORY CLEARED — agents will fail without coordination data');
  }

  // Search across collections (semantic/keyword)
  async search<T>(query: string, collections?: CollectionName[]): Promise<T[]> {
    const targetCollections = collections || Object.values(COLLECTIONS);
    const result = await this.request('POST', `/search`, {
      query,
      collections: targetCollections,
      limit: 20,
    });
    return (result?.results || []).map((r: { data: T }) => r.data);
  }

  // Get collection stats
  async stats(collection: CollectionName): Promise<{ count: number; lastUpdated: string | null }> {
    try {
      const result = await this.request('GET', `/collections/${collection}/stats`);
      return {
        count: result?.count || 0,
        lastUpdated: result?.last_updated || null,
      };
    } catch {
      return { count: 0, lastUpdated: null };
    }
  }

  // Check if memory is operational (for deletion test)
  async healthCheck(): Promise<{
    operational: boolean;
    collections: Record<string, number>;
  }> {
    const collections: Record<string, number> = {};
    let operational = true;

    for (const [key, name] of Object.entries(COLLECTIONS)) {
      try {
        const stat = await this.stats(name);
        collections[key] = stat.count;
      } catch {
        collections[key] = -1;
        operational = false;
      }
    }

    return { operational, collections };
  }

  private async request(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const url = `${this.config.endpoint}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Sibyl API error ${response.status}: ${errorText}`);
    }

    if (response.status === 204) return {};

    return response.json();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// Singleton instance
let instance: SibylMemory | null = null;

export function getSibylMemory(config?: Partial<SibylConfig>): SibylMemory {
  if (!instance) {
    instance = new SibylMemory(config);
  }
  return instance;
}

// Reset singleton (for testing)
export function resetSibylMemory(): void {
  instance = null;
}

export { SibylMemory };
export type { SibylConfig, QueryOptions };
