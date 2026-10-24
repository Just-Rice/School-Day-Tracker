import type { Assignment, ClassInfo, ISODate, Profile } from '../types';

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
  /**
   * Merges the given fields into the profile. With `changedDates`, p.dayOverrides only sets (or,
   * when missing from it, removes) those dates; otherwise it replaces the whole map.
   */
  saveProfile(p: Partial<Profile>, changedDates?: readonly ISODate[]): Promise<void>;
  subscribeClasses(cb: (c: ClassInfo[]) => void, onError?: OnError): Unsubscribe;
  /**
   * Writes the class. With `changed` (an existing class), only those top-level fields are written
   * (a field missing from `c` is removed) and the rest of the stored class is left alone, so a
   * stale copy on a device that was offline can't undo what another device changed.
   */
  saveClass(c: ClassInfo, changed?: readonly string[]): Promise<void>;
  deleteClass(id: string): Promise<void>;
  subscribeAssignments(cb: (a: Assignment[]) => void, onError?: OnError): Unsubscribe;
  /** like saveClass */
  saveAssignment(a: Assignment, changed?: readonly string[]): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));

/** top-level fields that differ between the stored copy and the new value; undefined when there's no stored copy */
export function changedFields(prev: object | undefined, next: object): string[] | undefined {
  if (!prev) return undefined;
  const p = prev as Record<string, unknown>, n = next as Record<string, unknown>;
  return [...new Set([...Object.keys(p), ...Object.keys(n)])].filter((k) => !same(p[k], n[k]));
}

/** dates whose day change differs between two dayOverrides maps */
export function changedDates(prev: Record<string, unknown> | undefined, next: Record<string, unknown>): ISODate[] {
  const p = prev ?? {};
  return [...new Set([...Object.keys(p), ...Object.keys(next)])].filter((d) => !same(p[d], next[d]));
}

/** `stored` with the `changed` fields taken from `next` (a field missing from `next` is removed) */
export function applyChanged<T extends object>(stored: T, next: T, changed: readonly string[]): T {
  const out = { ...stored } as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  for (const k of changed) {
    if (n[k] === undefined) delete out[k];
    else out[k] = n[k];
  }
  return out as T;
}

/** `cur` with the given dates of `next` applied (a date missing from `next` is removed) */
export function applyChangedDates<T>(cur: Record<string, T> | undefined, next: Record<string, T | undefined>, dates: readonly string[]): Record<string, T> {
  const out = { ...(cur ?? {}) };
  for (const d of dates) {
    const v = next[d];
    if (v === undefined || v === null) delete out[d];
    else out[d] = v;
  }
  return out;
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
