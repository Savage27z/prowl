// Memory API — debug endpoints for Sibyl Memory
// Used by the Memory debug page and deletion test demo

import { NextRequest, NextResponse } from 'next/server';
import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';

const memory = getSibylMemory();

// GET /api/memory — Health check, stats, and full dump
export async function GET() {
  try {
    const health = await memory.healthCheck();
    const collections = memory.dump();

    return NextResponse.json({ health, collections });
  } catch (error) {
    return NextResponse.json(
      { error: 'Memory check failed', details: String(error) },
      { status: 500 },
    );
  }
}

// DELETE /api/memory — Clear all memory (deletion test)
export async function DELETE(req: NextRequest) {
  const collection = req.nextUrl.searchParams.get('collection');

  try {
    if (collection && collection in COLLECTIONS) {
      const collectionName = COLLECTIONS[collection as keyof typeof COLLECTIONS];
      await memory.clearCollection(collectionName);
      return NextResponse.json({
        success: true,
        message: `Cleared collection: ${collection}`,
      });
    }

    // Clear ALL memory
    await memory.clearAll();
    return NextResponse.json({
      success: true,
      message: 'ALL MEMORY CLEARED — agents will fail without coordination data',
      warning: 'This is the deletion test. Agents cannot coordinate without Sibyl Memory.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Memory clear failed', details: String(error) },
      { status: 500 },
    );
  }
}
