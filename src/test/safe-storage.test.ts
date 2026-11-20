import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We import the module lazily inside tests after stubbing localStorage,
// because the helper may capture a reference to localStorage at import time.
// To be safe, we re-import fresh modules per test using vi.resetModules().

type SafeStorageModule = typeof import('../lib/safe-storage');

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'localStorage'
);

function stubThrowingLocalStorage() {
  const throwing = {
    getItem: vi.fn(() => {
      throw new Error('SecurityError: storage is not available');
    }),
    setItem: vi.fn(() => {
      throw new Error('SecurityError: storage is not available');
    }),
    removeItem: vi.fn(() => {
      throw new Error('SecurityError: storage is not available');
    }),
    clear: vi.fn(() => {
      throw new Error('SecurityError: storage is not available');
    }),
    key: vi.fn(() => {
      throw new Error('SecurityError: storage is not available');
    }),
    get length(): number {
      throw new Error('SecurityError: storage is not available');
    },
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      return throwing;
    },
  });

  return throwing;
}

function restoreLocalStorage() {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', originalLocalStorageDescriptor);
  }
}

async function loadSafeStorage(): Promise<SafeStorageModule> {
  vi.resetModules();
  return import('../lib/safe-storage');
}

describe('safe-storage with throwing localStorage', () => {
  beforeEach(() => {
    stubThrowingLocalStorage();
  });

  afterEach(() => {
    restoreLocalStorage();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('getItem returns null when storage throws', async () => {
    const { safeStorage } = await loadSafeStorage();
    expect(() => safeStorage.getItem('anything')).not.toThrow();
    expect(safeStorage.getItem('anything')).toBeNull();
  });

  it('setItem returns false when storage throws', async () => {
    const { safeStorage } = await loadSafeStorage();
    expect(() => safeStorage.setItem('key', 'value')).not.toThrow();
    expect(safeStorage.setItem('key', 'value')).toBe(false);
  });

  it('removeItem does not throw when storage throws', async () => {
    const { safeStorage } = await loadSafeStorage();
    expect(() => safeStorage.removeItem('key')).not.toThrow();
  });

  it('getJson returns the fallback when storage throws', async () => {
    const { safeStorage } = await loadSafeStorage();
    const fallback = { theme: 'dark' };
    expect(() => safeStorage.getJson('key', fallback)).not.toThrow();
    expect(safeStorage.getJson('key', fallback)).toEqual(fallback);
  });

  it('setJson returns false when storage throws', async () => {
    const { safeStorage } = await loadSafeStorage();
    expect(() => safeStorage.setJson('key', { a: 1 })).not.toThrow();
    expect(safeStorage.setJson('key', { a: 1 })).toBe(false);
  });
});

describe('draft storage with throwing localStorage', () => {
  beforeEach(() => {
    stubThrowingLocalStorage();
  });

  afterEach(() => {
    restoreLocalStorage();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('saveDraft, loadDraft and clearDraft do not throw when storage is broken', async () => {
    vi.resetModules();
    const draftModule = await import('../hooks/useDraftStorage');
    const { saveDraft, loadDraft, clearDraft } = draftModule as {
      saveDraft: (key: string, value: unknown) => void;
      loadDraft: (key: string, fallback?: unknown) => unknown;
      clearDraft: (key: string) => void;
    };

    expect(() => saveDraft('draft-key', { text: 'hello' })).not.toThrow();
    expect(() => loadDraft('draft-key', null)).not.toThrow();
    expect(loadDraft('draft-key', null)).toBeNull();
    expect(() => clearDraft('draft-key')).not.toThrow();
  });
});