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
  const { user } = useAuth();
  const store = useMemo<DataStore>(() => {
    if (!user) return localStore;
    try {
      return createFirestoreStore(user.uid);
    } catch (e) {
      console.error(e);
      return localStore;
    }
  }, [user]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setClasses(null);
    setAssignments(null);
    setError(null);
    const fail = (e: Error) => setError(e.message);
    const u1 = store.subscribeProfile((p) => setProfile(p ?? ({} as Profile)), fail);
    const u2 = store.subscribeClasses(setClasses, fail);
    const u3 = store.subscribeAssignments(setAssignments, fail);
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
