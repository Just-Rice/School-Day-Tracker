// Firebase setup. The web config comes from VITE_FIREBASE_* env vars (see .env.example).
// Without them the app runs in local-only mode and nothing here is ever initialized.
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth, useDeviceLanguage, type Auth } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  waitForPendingWrites,
  type Firestore,
  type FirestoreSettings,
} from 'firebase/firestore';

const env = import.meta.env;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const firebaseConfig: FirebaseOptions = {
  apiKey: str(env.VITE_FIREBASE_API_KEY),
  authDomain: str(env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: str(env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: str(env.VITE_FIREBASE_STORAGE_BUCKET) || undefined,
  messagingSenderId: str(env.VITE_FIREBASE_MESSAGING_SENDER_ID) || undefined,
  appId: str(env.VITE_FIREBASE_APP_ID),
};

/** true when this build has a Firebase web config, i.e. accounts and sync are available */
export const firebaseEnabled = !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

function assertEnabled() {
  if (!firebaseEnabled) throw new Error('Accounts are not set up on this copy of the app (no Firebase config).');
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  assertEnabled();
  app ??= getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    // initializeAuth (rather than getAuth) so the persistence is explicit: stay signed in across
    // visits, falling back to IndexedDB and then memory where localStorage is blocked.
    auth = initializeAuth(getFirebaseApp(), {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    useDeviceLanguage(auth);
  }
  return auth;
}

/**
 * Firestore with an offline cache shared by all open tabs, so the app opens instantly and keeps
 * working without a connection; writes made offline sync when the device is back online.
 */
export function getDb(): Firestore {
  if (db) return db;
  const fb = getFirebaseApp();
  const base: FirestoreSettings = { ignoreUndefinedProperties: true };
  const canPersist = typeof indexedDB !== 'undefined';
  try {
    db = initializeFirestore(fb, {
      ...base,
      localCache: canPersist ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
    });
  } catch {
    // Persistence can be unavailable (private browsing, storage disabled). The SDK also falls back
    // to memory on its own when IndexedDB fails later, so this only covers synchronous failures.
    db = initializeFirestore(fb, { ...base, localCache: memoryLocalCache() });
  }
  return db;
}

/** this tab's Firestore, if something has started it (never starts one) */
export function startedDb(): Firestore | undefined {
  return db;
}

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(timer));
}

/** true once every change saved through `d` has reached the server; false if that takes over `ms` (e.g. offline) */
export function writesSynced(d: Firestore, ms = 3000): Promise<boolean> {
  const synced = Promise.resolve()
    .then(() => waitForPendingWrites(d))
    .then(
      () => true,
      () => false,
    );
  return within(synced, ms, false);
}

/**
 * Stops a Firestore instance once its account has signed out (AuthProvider does this in every
 * open tab), so the next sign-in starts a fresh one. With `clearCache` it also deletes this
 * browser's offline copy of the account's documents (classes, homework, teacher contacts), so the
 * next person to use a shared computer can't read them; Firestore stops in other tabs by itself
 * when that happens. Only clear once writesSynced(): edits still waiting to sync go with the cache.
 * Never throws.
 */
export async function closeDb(d: Firestore | undefined, clearCache = false): Promise<void> {
  if (!d) return;
  if (db === d) db = undefined;
  const run = async () => {
    await terminate(d);
    if (clearCache) await clearIndexedDbPersistence(d);
  };
  const done = run().catch((e: unknown) => console.warn('Could not clear the offline copy of the account’s data', e));
  // deleting the cache waits for every other tab to let go of it; don't keep the student waiting
  await within(done, 5000, undefined);
}
