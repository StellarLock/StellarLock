import { useState, useCallback } from 'react';

export interface Lock {
  id:          string;
  status:      'locked' | 'unlockable' | 'withdrawn' | 'pending';
  unlockAt:    number;
  beneficiary: string;
  amount:      string;
  [key: string]: unknown;
}

export function useOptimisticLock(initialLocks: Lock[]) {
  const [locks, setLocks] = useState<Lock[]>(initialLocks);
  const [pending, setPending] = useState<Map<string, Lock>>(new Map());

  const applyOptimistic = useCallback((lockId: string, update: Partial<Lock>) => {
    setPending(prev => {
      const original = locks.find(l => l.id === lockId);
      if (original) prev.set(lockId, original); // save snapshot for rollback
      return new Map(prev);
    });
    setLocks(prev =>
      prev.map(l => l.id === lockId ? { ...l, ...update, status: 'pending' } : l)
    );
  }, [locks]);

  const confirmOptimistic = useCallback((lockId: string) => {
    setPending(prev => { prev.delete(lockId); return new Map(prev); });
    setLocks(prev =>
      prev.map(l => l.id === lockId
        ? { ...l, status: l.status === 'pending' ? 'locked' : l.status }
        : l
      )
    );
  }, []);

  const revertOptimistic = useCallback((lockId: string, reason: string) => {
    const original = pending.get(lockId);
    if (original) {
      setLocks(prev => prev.map(l => l.id === lockId ? original : l));
    }
    setPending(prev => { prev.delete(lockId); return new Map(prev); });
    showErrorToast(`Transaction failed: ${reason}`);
  }, [pending]);

  return { locks, applyOptimistic, confirmOptimistic, revertOptimistic };
}

function showErrorToast(message: string) {
  // Wire up to your existing toast/notification system
  console.error('[OptimisticUI]', message);
}