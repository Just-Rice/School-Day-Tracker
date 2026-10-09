// Moving the data saved in this browser (local mode) into the signed-in account.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useData } from '../../data/DataProvider';
import { localStore } from '../../data/localStore';
import { copyDeviceToAccount } from './dataOps';

export interface LocalCounts {
  classes: number;
  assignments: number;
}

/** Live counts of the classes and assignments saved in this browser's local mode. */
export function useLocalCounts(): LocalCounts {
  const [counts, setCounts] = useState<LocalCounts>(() => {
    const s = localStore.snapshot();
    return { classes: s.classes.length, assignments: s.assignments.length };
  });
  useEffect(() => {
    const u1 = localStore.subscribeClasses((c) => setCounts((p) => (p.classes === c.length ? p : { ...p, classes: c.length })));
    const u2 = localStore.subscribeAssignments((a) => setCounts((p) => (p.assignments === a.length ? p : { ...p, assignments: a.length })));
    return () => {
      u1();
      u2();
    };
  }, []);
  return counts;
}

const dismissKey = (uid: string) => `sdt:v1:device-copy-dismissed:${uid}`;

/** true when the student said "not now" to copying this device's data into this account */
export function isDeviceCopyDismissed(uid: string | undefined): boolean {
  if (!uid) return false;
  try {
    return localStorage.getItem(dismissKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function dismissDeviceCopy(uid: string): void {
  try {
    localStorage.setItem(dismissKey(uid), '1');
  } catch {
    // storage blocked: the offer just comes back next time
  }
}

export type CopyPhase = 'idle' | 'copying' | 'copied' | 'cleared';

export interface DeviceCopy {
  /** signed in and syncing to Firestore */
  accountStore: boolean;
  /** accountStore, and this browser has local classes or assignments */
  available: boolean;
  local: LocalCounts;
  phase: CopyPhase;
  /** what the last copy wrote (items the account already had are skipped) */
  copied: LocalCounts | null;
  error: string | null;
  copy(): Promise<boolean>;
  /** deletes this browser's local-mode data (the account keeps its copy) */
  clearLocal(): void;
}

// The copy's progress is shared by every component that offers it (the banner and Settings), so
// copying from one updates the other.
interface CopyState {
  uid: string | null;
  phase: CopyPhase;
  copied: LocalCounts | null;
  error: string | null;
}
const IDLE: CopyState = { uid: null, phase: 'idle', copied: null, error: null };
let copyState = IDLE;
const copyListeners = new Set<() => void>();
function setCopyState(next: CopyState) {
  copyState = next;
  copyListeners.forEach((l) => l());
}
function subscribeCopyState(l: () => void) {
  copyListeners.add(l);
  return () => {
    copyListeners.delete(l);
  };
}

/** forgets any copy in progress or finished (after signing out; tests) */
export function resetDeviceCopy(): void {
  if (copyState !== IDLE) setCopyState(IDLE);
}

export function useDeviceCopy(): DeviceCopy {
  const { user } = useAuth();
  const { store, profile, classes, assignments } = useData();
  const local = useLocalCounts();
  const shared = useSyncExternalStore(subscribeCopyState, () => copyState);
  const uid = user?.uid;
  const accountStore = !!uid && store.kind === 'firestore';
  // another account's copy (before a sign-out) doesn't apply
  const st = uid && shared.uid === uid ? shared : IDLE;

  useEffect(() => {
    if (!uid) resetDeviceCopy();
  }, [uid]);

  const copy = useCallback(async () => {
    if (!uid || !accountStore) return false;
    setCopyState({ uid, phase: 'copying', copied: null, error: null });
    try {
      const copied = await copyDeviceToAccount(uid, { profile, classes, assignments });
      setCopyState({ uid, phase: 'copied', copied, error: null });
      return true;
    } catch (e) {
      setCopyState({ uid, phase: 'idle', copied: null, error: (e as Error).message || 'Could not copy your data. Try again.' });
      return false;
    }
  }, [uid, accountStore, profile, classes, assignments]);

  const clearLocal = useCallback(() => {
    localStore.clear();
    setCopyState({ ...copyState, uid: uid ?? null, phase: 'cleared', error: null });
  }, [uid]);

  return {
    accountStore,
    available: accountStore && local.classes + local.assignments > 0,
    local,
    phase: st.phase,
    copied: st.copied,
    error: st.error,
    copy,
    clearLocal,
  };
}
