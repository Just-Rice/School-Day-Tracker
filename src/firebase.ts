// Firebase setup. The web config comes from VITE_FIREBASE_* env vars (see .env.example).
// Without them the app runs in local-only mode and nothing here is ever initialized.
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth, useDeviceLanguage, type Auth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, type Firestore, type FirestoreSettings } from 'firebase/firestore';

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
