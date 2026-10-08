import type { DataStore } from './store';

/** Firestore-backed store for users/{uid}. (Implemented by the auth/sync work.) */
export function createFirestoreStore(_uid: string): DataStore {
  throw new Error('Firestore sync is not set up yet');
}
