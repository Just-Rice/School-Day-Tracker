import { createContext, useContext, type ReactNode } from 'react';

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
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(email: string, password: string, displayName?: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const unavailable = async () => {
  throw new Error('Accounts are not set up on this copy of the app (no Firebase config).');
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: false,
  firebaseEnabled: false,
  signInWithGoogle: unavailable,
  signInWithEmail: unavailable,
  signUpWithEmail: unavailable,
  resetPassword: unavailable,
  signOut: async () => {},
});

/** Local-only placeholder until Firebase auth is wired in. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={useContext(AuthContext)}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
