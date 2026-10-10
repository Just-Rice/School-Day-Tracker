import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { closeDb, firebaseEnabled, getFirebaseAuth, startedDb, writesSynced } from '../firebase';
import { AuthError, authErrorCode, isCancelled } from '../components/account/authErrors';

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface AuthState {
  /** null in local mode / signed out */
  user: AppUser | null;
  /** true while Firebase restores the session on page load */
  loading: boolean;
  /** false when no Firebase config was provided at build time */
  firebaseEnabled: boolean;
  /** a failed Google sign-in that came back through a redirect (shown on the login page) */
  redirectError?: string | null;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(email: string, password: string, displayName?: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const unavailable = async () => {
  throw new Error('Accounts are not set up on this copy of the app (no Firebase config).');
};

const LOCAL_ONLY: AuthState = {
  user: null,
  loading: false,
  firebaseEnabled: false,
  redirectError: null,
  signInWithGoogle: unavailable,
  signInWithEmail: unavailable,
  signUpWithEmail: unavailable,
  resetPassword: unavailable,
  signOut: async () => {},
};

const AuthContext = createContext<AuthState>(LOCAL_ONLY);

function toAppUser(u: User): AppUser {
  return { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL };
}

/** keeps the same object when nothing changed, so consumers keyed on `user` don't re-run */
function sameUser(prev: AppUser | null, next: AppUser | null): AppUser | null {
  if (prev && next && prev.uid === next.uid && prev.displayName === next.displayName && prev.email === next.email && prev.photoURL === next.photoURL) return prev;
  return next;
}

// The popup can't open in some places (blocked pop-ups, iOS home-screen apps, in-app browsers);
// the full-page redirect works there.
const USE_REDIRECT = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    let uid: string | null = null;
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        // the account signed out (in this tab or another): its Firestore instance is done with
        if (uid && uid !== (u?.uid ?? null)) void closeDb(startedDb());
        uid = u?.uid ?? null;
        setUser((prev) => sameUser(prev, u ? toAppUser(u) : null));
        setLoading(false);
      },
      () => setLoading(false),
    );
    // finishes a signInWithRedirect; the user itself arrives through onAuthStateChanged
    getRedirectResult(auth).catch((e: unknown) => {
      if (!isCancelled(e)) setRedirectError(new AuthError(e).message);
    });
    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setRedirectError(null);
    try {
      // called before any await so the popup still counts as opened by the click
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code = authErrorCode(e);
      if (!code || !USE_REDIRECT.has(code)) throw new AuthError(e);
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2) {
        throw new AuthError(e2);
      }
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    } catch (e) {
      throw new AuthError(e);
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    let created: User;
    try {
      created = (await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)).user;
    } catch (e) {
      throw new AuthError(e);
    }
    const name = displayName?.trim();
    if (!name) return;
    try {
      await updateProfile(created, { displayName: name });
      // updateProfile doesn't fire onAuthStateChanged, so publish the new name ourselves
      setUser((prev) => sameUser(prev, toAppUser(created)));
    } catch {
      // the account exists and they're signed in; a missing display name isn't worth failing over
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
    } catch (e) {
      throw new AuthError(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    // Firestore keeps an offline copy of the account's data in this browser; delete it after
    // signing out, unless edits made offline are still waiting in it to sync (then it stays, and
    // they sync the next time this account signs in here).
    const db = startedDb();
    const synced = db ? await writesSynced(db) : false;
    try {
      await fbSignOut(getFirebaseAuth());
    } catch (e) {
      throw new AuthError(e);
    }
    await closeDb(db, synced);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, firebaseEnabled: true, redirectError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut }),
    [user, loading, redirectError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Firebase accounts when this build has a config; otherwise local-only (no user, ever). */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (firebaseEnabled) return <FirebaseAuthProvider>{children}</FirebaseAuthProvider>;
  return <AuthContext.Provider value={LOCAL_ONLY}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
