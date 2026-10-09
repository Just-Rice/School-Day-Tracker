// Firestore-backed DataStore. Layout (see firestore.rules):
//   users/{uid}                    the Profile fields at top level (+ updatedAt)
//   users/{uid}/classes/{id}       one ClassInfo per document
//   users/{uid}/assignments/{id}   one Assignment per document
import { collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, setDoc, writeBatch, type DocumentData, type FieldValue, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { Assignment, ClassInfo, Profile } from '../types';
import { getDb } from '../firebase';
import { clean, type DataStore, type Unsubscribe } from './store';

export const CLASSES = 'classes';
export const ASSIGNMENTS = 'assignments';
/** Firestore allows 500 writes per batch; stay well under it */
export const BATCH_LIMIT = 450;

const PROFILE_KEYS = ['displayName', 'schoolId', 'grade', 'theme', 'clock', 'customSchedule', 'dayOverrides', 'onboarded'] as const satisfies readonly (keyof Profile)[];

export interface ProfileWrite {
  data: Record<string, unknown>;
  /** top-level fields to write; each is replaced as a whole (see toFirestoreProfile) */
  fields: string[];
}

/**
 * Maps a saveProfile() patch to a Firestore write, given Firestore's delete sentinel.
 *
 * Written with setDoc(ref, data, { mergeFields: fields }) where `fields` are top-level names.
 * Unlike { merge: true }, which deep-merges maps key by key (so a day override removed from
 * dayOverrides would live on in Firestore), mergeFields replaces each listed field with the new
 * value wholesale, while leaving fields that aren't in the patch untouched. That gives the same
 * semantics as LocalStore's `{ ...current, ...patch }`:
 *   - dayOverrides / customSchedule passed in full replace the stored value (removed keys vanish)
 *   - a key present with value undefined (e.g. { customSchedule: undefined }) deletes the field
 *   - keys that aren't Profile fields are ignored; updatedAt is always stamped
 * setDoc also creates the document if it doesn't exist yet, which updateDoc would refuse.
 */
export function toFirestoreProfile<D>(p: Partial<Profile>, del: D, now: number = Date.now()): { data: Record<string, unknown | D>; fields: string[] } {
  const data: Record<string, unknown | D> = {};
  for (const k of PROFILE_KEYS) {
    if (!(k in p)) continue;
    const v = p[k];
    data[k] = v === undefined || v === null ? del : clean(v);
  }
  data.updatedAt = now;
  return { data, fields: Object.keys(data) };
}

/** A stored profile document back to a Profile (unknown fields dropped). */
export function fromFirestoreProfile(d: DocumentData | undefined): Profile | null {
  if (!d) return null;
  const out: Record<string, unknown> = {};
  for (const k of [...PROFILE_KEYS, 'updatedAt'] as const) if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
  return out as unknown as Profile;
}

/** the document id is the source of truth for `id` */
function fromItemDoc<T extends { id: string }>(d: QueryDocumentSnapshot): T {
  return { ...d.data(), id: d.id } as T;
}

// ---------------------------------------------------------------------------------------------
// Writes and offline
// ---------------------------------------------------------------------------------------------

/**
 * Firestore applies a write to the local cache (and every listener) right away, but the promise
 * only settles once the server confirms it, which never happens while offline. Pages await
 * saves before navigating, so resolve after a short grace period instead, and report a failure
 * that arrives later (e.g. permission denied) through `onLateError`.
 */
export function settleWrite(p: Promise<unknown>, ms: number, onLateError?: (e: Error) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve();
    }, ms);
    p.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      },
      (e: unknown) => {
        const err = friendlyFirestoreError(e);
        if (settled) onLateError?.(err);
        else {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      },
    );
  });
}

/** how long to wait for the server before letting the UI move on */
function graceMs(onlineMs: number): number {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 50 : onlineMs;
}

const FRIENDLY: Record<string, string> = {
  'permission-denied': 'Your account doesn’t have access to this data. Try signing out and back in.',
  unauthenticated: 'You’ve been signed out. Sign in again to keep syncing.',
  unavailable: 'Can’t reach the sync server right now. Changes stay on this device and sync when you’re back online.',
  'resource-exhausted': 'The sync service is busy (quota reached). Try again later.',
  'invalid-argument': 'That couldn’t be saved: some of the data isn’t valid.',
  'failed-precondition': 'Sync isn’t fully set up for this app (check the Firestore database and rules).',
  'deadline-exceeded': 'Syncing took too long. Check your connection and try again.',
};

export function friendlyFirestoreError(e: unknown): Error {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && FRIENDLY[code]) return new Error(FRIENDLY[code]);
  if (e instanceof Error) return e;
  return new Error('Something went wrong while syncing.');
}

// Every live subscription's error callback (ref-counted: DataProvider passes one callback to all
// three). A write that fails after its promise already resolved is reported to them instead.
const lateErrorListeners = new Map<(e: Error) => void, number>();
function reportLate(e: Error) {
  lateErrorListeners.forEach((_, l) => l(e));
}

function track(onError: ((e: Error) => void) | undefined, unsub: Unsubscribe): Unsubscribe {
  if (!onError) return unsub;
  lateErrorListeners.set(onError, (lateErrorListeners.get(onError) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (lateErrorListeners.get(onError) ?? 1) - 1;
    if (n > 0) lateErrorListeners.set(onError, n);
    else lateErrorListeners.delete(onError);
    unsub();
  };
}

const write = (p: Promise<unknown>) => settleWrite(p, graceMs(2500), reportLate);

// ---------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------

function refs(db: Firestore, uid: string) {
  const user = doc(db, 'users', uid);
  return { user, classes: collection(user, CLASSES), assignments: collection(user, ASSIGNMENTS) };
}

export function createFirestoreStore(uid: string): DataStore {
  const db = getDb();
  const r = refs(db, uid);
  const fail = (onError?: (e: Error) => void) => (e: unknown) => onError?.(friendlyFirestoreError(e));

  return {
    kind: 'firestore',

    subscribeProfile(cb, onError) {
      return track(
        onError,
        onSnapshot(r.user, (s) => cb(fromFirestoreProfile(s.data())), fail(onError)),
      );
    },
    saveProfile(p) {
      const { data, fields } = toFirestoreProfile<FieldValue>(p, deleteField());
      return write(setDoc(r.user, data, { mergeFields: fields }));
    },

    subscribeClasses(cb, onError) {
      return track(
        onError,
        onSnapshot(r.classes, (s) => cb(s.docs.map((d) => fromItemDoc<ClassInfo>(d))), fail(onError)),
      );
    },
    saveClass(c) {
      return write(setDoc(doc(r.classes, c.id), clean(c)));
    },
    deleteClass(id) {
      return write(deleteDoc(doc(r.classes, id)));
    },

    subscribeAssignments(cb, onError) {
      return track(
        onError,
        onSnapshot(r.assignments, (s) => cb(s.docs.map((d) => fromItemDoc<Assignment>(d))), fail(onError)),
      );
    },
    saveAssignment(a) {
      return write(setDoc(doc(r.assignments, a.id), clean(a)));
    },
    deleteAssignment(id) {
      return write(deleteDoc(doc(r.assignments, id)));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------------------------

type Op = (b: ReturnType<typeof writeBatch>) => void;

/** splits ops into batches of at most `size` */
export function chunk<T>(items: T[], size: number = BATCH_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function commitAll(db: Firestore, ops: Op[]): Promise<void> {
  for (const part of chunk(ops)) {
    const b = writeBatch(db);
    part.forEach((op) => op(b));
    // bulk jobs get a longer grace period than single saves, but still don't hang offline
    await settleWrite(b.commit(), graceMs(8000), reportLate);
  }
}

export interface AccountCopy {
  /**
   * fields to write into the account's profile; null/omitted leaves it alone. Pass
   * profileMergeFields(local, account) from lib/backup to only fill in what the account lacks
   * (copying a whole local profile would overwrite the account's school and settings).
   */
  profile?: Partial<Profile> | null;
  classes: ClassInfo[];
  assignments: Assignment[];
}

/** Writes this device's data into users/{uid} (same ids, so running it twice is harmless). */
export async function copyLocalDataToAccount(uid: string, data: AccountCopy): Promise<void> {
  const db = getDb();
  const r = refs(db, uid);
  const ops: Op[] = [];
  if (data.profile && Object.keys(data.profile).length) {
    const { data: pd, fields } = toFirestoreProfile<FieldValue>(data.profile, deleteField());
    ops.push((b) => b.set(r.user, pd, { mergeFields: fields }));
  }
  for (const c of data.classes) ops.push((b) => b.set(doc(r.classes, c.id), clean(c)));
  for (const a of data.assignments) ops.push((b) => b.set(doc(r.assignments, a.id), clean(a)));
  await commitAll(db, ops);
}

/** Deletes every class, assignment and the profile of users/{uid}. */
export async function deleteAllUserData(uid: string): Promise<void> {
  const db = getDb();
  const r = refs(db, uid);
  try {
    const [classes, assignments] = await Promise.all([getDocs(r.classes), getDocs(r.assignments)]);
    const ops: Op[] = [...classes.docs, ...assignments.docs].map((d) => (b) => b.delete(d.ref));
    ops.push((b) => b.delete(r.user));
    await commitAll(db, ops);
  } catch (e) {
    throw friendlyFirestoreError(e);
  }
}
