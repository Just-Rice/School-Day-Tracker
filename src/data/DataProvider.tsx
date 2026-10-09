import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Assignment, ClassInfo, Profile } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { createFirestoreStore } from './firestoreStore';
import { localStore } from './localStore';
import { DEFAULT_PROFILE, type DataStore } from './store';

export interface DataState {
  store: DataStore;
  /** always complete: stored fields over DEFAULT_PROFILE */
  profile: Profile;
  classes: ClassInfo[];
  assignments: Assignment[];
  /** true until the first snapshot of each collection arrives */
  loading: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const profile = profileSnap?.from === store ? profileSnap.v : null;
  const classes = classesSnap?.from === store ? classesSnap.v : null;
  const assignments = assignmentsSnap?.from === store ? assignmentsSnap.v : null;

  useEffect(() => {
    setError(null);
    const fail = (e: Error) => setError(e.message);
    const u1 = store.subscribeProfile((p) => setProfile({ from: store, v: p ?? ({} as Profile) }), fail);
    const u2 = store.subscribeClasses((v) => setClasses({ from: store, v }), fail);
    const u3 = store.subscribeAssignments((v) => setAssignments({ from: store, v }), fail);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [store]);

  const wrap = useCallback(
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
      async (...a: A) => {
        try {
          await fn(...a);
        } catch (e) {
          setError((e as Error).message);
          throw e;
        }
      },
    [],
  );

  const value = useMemo<DataState>(
    () => ({
      store,
      profile: { ...DEFAULT_PROFILE, ...(profile ?? {}), dayOverrides: { ...(profile?.dayOverrides ?? {}) } },
      classes: [...(classes ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      assignments: assignments ?? [],
      loading: profile === null || classes === null || assignments === null,
      error,
      saveProfile: wrap((p: Partial<Profile>) => store.saveProfile(p)),
      saveClass: wrap((c: ClassInfo) => store.saveClass({ ...c, updatedAt: Date.now() })),
      deleteClass: wrap((id: string) => store.deleteClass(id)),
      saveAssignment: wrap((a: Assignment) => store.saveAssignment({ ...a, updatedAt: Date.now() })),
      deleteAssignment: wrap((id: string) => store.deleteAssignment(id)),
    }),
    [store, profile, classes, assignments, error, wrap],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
