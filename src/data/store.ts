import type { Assignment, ClassInfo, Profile } from '../types';

export type Unsubscribe = () => void;

/**
 * Why a subscription's onError was called: 'listen' when the subscription itself failed (it
 * delivers nothing more; subscribe again to retry), 'save' when a save that had already resolved
 * failed later (FirestoreStore, see settleWrite).
 */
export type ErrorSource = 'listen' | 'save';
export type OnError = (e: Error, source: ErrorSource) => void;

/**
 * Where a user's data lives. LocalStore keeps it in this browser; FirestoreStore keeps it in
 * users/{uid} in Firestore and syncs across devices. Subscriptions call back immediately with
 * the current value and again on every change (including changes from other devices).
 */
export interface DataStore {
  readonly kind: 'local' | 'firestore';
  subscribeProfile(cb: (p: Profile | null) => void, onError?: OnError): Unsubscribe;
  /** merges the given fields into the profile */
  saveProfile(p: Partial<Profile>): Promise<void>;
  subscribeClasses(cb: (c: ClassInfo[]) => void, onError?: OnError): Unsubscribe;
  saveClass(c: ClassInfo): Promise<void>;
  deleteClass(id: string): Promise<void>;
  subscribeAssignments(cb: (a: Assignment[]) => void, onError?: OnError): Unsubscribe;
  saveAssignment(a: Assignment): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

export const DEFAULT_PROFILE: Profile = {
  schoolId: 'hsn',
  theme: 'system',
  clock: '12h',
  dayOverrides: {},
  onboarded: false,
};

/** Firestore and JSON reject `undefined`; drop those keys (deeply) before saving. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}
