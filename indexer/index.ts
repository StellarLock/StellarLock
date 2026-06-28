import { Server } from '@stellar/stellar-sdk/rpc';
import { initDb, db, getMeta, setMeta } from './db';

interface IndexedLock {
  id: string;
  kind: 'token' | 'lp';
  creator: string;
  beneficiary: string;
  token: string;
  token_a?: string | null;
  token_b?: string | null;
  dex?: string | null;
  pool_share?: string | null;
  amount: bigint;
  unlockAt: number;
  status: 'locked' | 'withdrawn';
  createdAt: number;
  extendedCount?: number;
  withdrawn?: boolean;
}


interface AggregateStats {
  totalLocks:  number;
  totalValue:  bigint;
  uniqueTokens: number;
  recentLocks: IndexedLock[];
  upcomingUnlocks: IndexedLock[];
}


function processEvent(event: { type: string; body: { value: unknown } }) {
  // Parse lock creation / withdrawal events from contract
  // and upsert into lockIndex
  // Implementation depends on your contract's event schema
}

export function getStats(): AggregateStats {
  const locks       = Array.from(lockIndex.values());
  const now         = Math.floor(Date.now() / 1000);
  const uniqueTokens = new Set(locks.map(l => l.token)).size;

  return {
    totalLocks:  locks.length,
    totalValue:  locks.reduce((sum, l) => sum + l.amount, BigInt(0)),
    uniqueTokens,
    recentLocks:     locks.slice(-10).reverse(),
    upcomingUnlocks: locks
      .filter(l => l.status === 'locked' && l.unlockAt > now)
      .sort((a, b) => a.unlockAt - b.unlockAt)
      .slice(0, 10),
  };
}

export function getLocksForToken(token: string) {
  return Array.from(lockIndex.values()).filter(l => l.token === token);
}

export function getLastIndexed() { return lastIndexed; }

// Start polling every 10 seconds
