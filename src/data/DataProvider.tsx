import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Assignment, ClassInfo, Profile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import LoadErrorScreen from '../components/account/LoadErrorScreen';
import { createFirestoreStore } from './firestoreStore';
import { localStore } from './localStore';
import { DEFAULT_PROFILE, type DataStore, type ErrorSource } from './store';

export interface DataState {
  store: DataStore;
  /** always complete: stored fields over DEFAULT_PROFILE */
  profile: Profile;
  classes: ClassInfo[];
  assignments: Assignment[];
  /** true until the first snapshot of each collection arrives */
  loading: boolean;
  /** a sync problem: a subscription that failed (until it works again) or a failed save (until a later save works) */
  error: string | null;
  saveProfile(p: Partial<Profile>): Promise<void>;
  saveClass(c: ClassInfo): Promise<void>;
  deleteClass(id: string): Promise<void>;
  saveAssignment(a: Assignment): Promise<void>;
  deleteAssignment(id: string): Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  // keyed on the uid so a profile change (e.g. display name) doesn't re-create the listeners
  const uid = useAuth().user?.uid;
  const store = useMemo<DataStore>(() => {
    if (!uid) return localStore;
    try {
      return createFirestoreStore(uid);
    } catch (e) {
      console.error(e);
      return localStore;
    }
  }, [uid]);

  // Each snapshot remembers the store it came from, so right after sign-in/out the previous
  // store's data is never shown as the new one's (it reads as loading until fresh data arrives).
  type Snap<T> = { from: DataStore; v: T } | null;
  const [profileSnap, setProfile] = useState<Snap<Profile>>(null);
  const [classesSnap, setClasses] = useState<Snap<ClassInfo[]>>(null);
  const [assignmentsSnap, setAssignments] = useState<Snap<Assignment[]>>(null);
  const profile = profileSnap?.from === store ? profileSnap.v : null;
  const classes = classesSnap?.from === store ? classesSnap.v : null;
  const assignments = assignmentsSnap?.from === store ? assignmentsSnap.v : null;
  const loading = profile === null || classes === null || assignments === null;

  // Errors remember their store as well. A subscription that fails stops for good (Firestore
  // listeners don't recover), so they're all subscribed again (`attempt`) on Try again and when
  // the app comes back to the foreground or online; the error goes once all three deliver again.
  // A failed save's error goes once a later save works.
  type Failure = { from: DataStore; message: string } | null;
  const [listenFailure, setListenFailure] = useState<Failure>(null);
  const [saveFailure, setSaveFailure] = useState<Failure>(null);
  const [attempt, setAttempt] = useState(0);
  const listenError = listenFailure?.from === store ? listenFailure.message : null;
  const saveError = saveFailure?.from === store ? saveFailure.message : null;

  useEffect(() => {
    let live = true;
    const waiting = new Set(['profile', 'classes', 'assignments']);
    const got = (k: string) => {
      if (waiting.delete(k) && waiting.size === 0) setListenFailure((f) => (f?.from === store ? null : f));
    };
    const fail = (e: Error, source?: ErrorSource) => {
      if (!live) return;
      if (source === 'save') setSaveFailure({ from: store, message: e.message });
      else setListenFailure({ from: store, message: e.message });
    };
    const u1 = store.subscribeProfile((p) => {
      setProfile({ from: store, v: p ?? ({} as Profile) });
      got('profile');
    }, fail);
    const u2 = store.subscribeClasses((v) => {
      setClasses({ from: store, v });
      got('classes');
    }, fail);
    const u3 = store.subscribeAssignments((v) => {
      setAssignments({ from: store, v });
      got('assignments');
    }, fail);
    return () => {
      live = false;
      u1();
      u2();
      u3();
    };
  }, [store, attempt]);

  const listenFailed = listenError !== null;
  useEffect(() => {
    if (!listenFailed) return;
    const again = () => {
      if (document.visibilityState !== 'hidden') setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('online', again);
    };
  }, [listenFailed]);

  const retry = useCallback(() => {
    setListenFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  const wrap = useCallback(
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
      async (...a: A) => {
        try {
          await fn(...a);
        } catch (e) {
          setSaveFailure({ from: store, message: (e as Error).message });
          throw e;
        }
        setSaveFailure(null);
      },
    [store],
  );

  const value = useMemo<DataState>(
    () => ({
      store,
      profile: { ...DEFAULT_PROFILE, ...(profile ?? {}), dayOverrides: { ...(profile?.dayOverrides ?? {}) } },
      classes: [...(classes ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      assignments: assignments ?? [],
      loading,
      error: listenError ?? saveError,
      saveProfile: wrap((p: Partial<Profile>) => store.saveProfile(p)),
      saveClass: wrap((c: ClassInfo) => store.saveClass({ ...c, updatedAt: Date.now() })),
      deleteClass: wrap((id: string) => store.deleteClass(id)),
      saveAssignment: wrap((a: Assignment) => store.saveAssignment({ ...a, updatedAt: Date.now() })),
      deleteAssignment: wrap((id: string) => store.deleteAssignment(id)),
    }),
    [store, profile, classes, assignments, loading, listenError, saveError, wrap],
  );

  // Nothing could be loaded (e.g. a new device and the sync server refuses): say so and offer a
  // way out, instead of the pages' loading spinner forever.
  return <DataContext.Provider value={value}>{loading && listenError ? <LoadErrorScreen message={listenError} onRetry={retry} /> : children}</DataContext.Provider>;
}

export function useData(): DataState {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
