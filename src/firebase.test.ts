// firebase.ts's Firestore lifecycle against a stubbed SDK (no network, no Firebase project).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  instances: [] as object[],
  initializeFirestore: vi.fn((..._a: unknown[]) => {
    const db = { n: sdk.instances.length + 1 };
    sdk.instances.push(db);
    return db;
  }),
  terminate: vi.fn(async (..._a: unknown[]) => {}),
  clearIndexedDbPersistence: vi.fn(async (..._a: unknown[]) => {}),
  waitForPendingWrites: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('firebase/app', () => ({ initializeApp: () => ({ name: 'app' }), getApps: () => [], getApp: () => ({ name: 'app' }) }));
vi.mock('firebase/auth', () => ({}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: sdk.initializeFirestore,
  memoryLocalCache: () => ({ kind: 'memory' }),
  persistentLocalCache: () => ({ kind: 'persistent' }),
  persistentMultipleTabManager: () => ({}),
  terminate: sdk.terminate,
  clearIndexedDbPersistence: sdk.clearIndexedDbPersistence,
  waitForPendingWrites: sdk.waitForPendingWrites,
}));

async function load() {
  vi.resetModules();
  for (const k of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID']) vi.stubEnv(`VITE_FIREBASE_${k}`, 'x');
  return import('./firebase');
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.instances.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('closeDb', () => {
  it('stops the instance and deletes its offline copy, and the next account gets a fresh one', async () => {
    const fb = await load();
    const db = fb.getDb();
    expect(fb.startedDb()).toBe(db);
    await fb.closeDb(db, true);
    expect(sdk.terminate).toHaveBeenCalledWith(db);
    expect(sdk.clearIndexedDbPersistence).toHaveBeenCalledWith(db);
    expect(sdk.terminate.mock.invocationCallOrder[0]).toBeLessThan(sdk.clearIndexedDbPersistence.mock.invocationCallOrder[0]);
    expect(fb.startedDb()).toBeUndefined();
    expect(fb.getDb()).not.toBe(db);
  });

  it('keeps the offline copy unless asked, and does nothing when Firestore never started', async () => {
    const fb = await load();
    await fb.closeDb(undefined, true);
    expect(sdk.terminate).not.toHaveBeenCalled();
    await fb.closeDb(fb.getDb());
    expect(sdk.terminate).toHaveBeenCalledTimes(1);
    expect(sdk.clearIndexedDbPersistence).not.toHaveBeenCalled();
  });

  it('never throws, and gives up waiting when another tab holds the cache open', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fb = await load();
    sdk.clearIndexedDbPersistence.mockRejectedValueOnce(new Error('failed-precondition'));
    await expect(fb.closeDb(fb.getDb(), true)).resolves.toBeUndefined();
    vi.useFakeTimers();
    sdk.clearIndexedDbPersistence.mockImplementationOnce(() => new Promise(() => {}));
    const closing = fb.closeDb(fb.getDb(), true);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(closing).resolves.toBeUndefined();
  });
});

describe('writesSynced', () => {
  it('is true once the server has every write, false while they are stuck offline', async () => {
    const fb = await load();
    const db = fb.getDb();
    await expect(fb.writesSynced(db)).resolves.toBe(true);
    vi.useFakeTimers();
    sdk.waitForPendingWrites.mockImplementationOnce(() => new Promise(() => {}));
    const offline = fb.writesSynced(db, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(offline).resolves.toBe(false);
  });
});
