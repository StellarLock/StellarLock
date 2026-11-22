import { createLogger } from "./logger";

const logger = createLogger("safe-storage");

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage;
  } catch (error) {
    logger.warn("Unable to access localStorage", error);
    return null;
  }
}

export function getItem(key: string): string | null {
  try {
    const storage = getStorage();
    if (!storage) {
      return null;
    }
    return storage.getItem(key);
  } catch (error) {
    logger.warn(`Failed to read key "${key}" from localStorage`, error);
    return null;
  }
}

export function setItem(key: string, value: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) {
      return false;
    }
    storage.setItem(key, value);
    return true;
  } catch (error) {
    logger.warn(`Failed to write key "${key}" to localStorage`, error);
    return false;
  }
}

export function removeItem(key: string): void {
  try {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    storage.removeItem(key);
  } catch (error) {
    logger.warn(`Failed to remove key "${key}" from localStorage`, error);
  }
}

export function getJson<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw === null) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn(`Failed to parse JSON for key "${key}"`, error);
    return fallback;
  }
}

export function setJson(key: string, value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return false;
    }
    return setItem(key, serialized);
  } catch (error) {
    logger.warn(`Failed to serialize JSON for key "${key}"`, error);
    return false;
  }
}