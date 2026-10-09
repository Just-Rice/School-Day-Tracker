// AuthProvider against a stubbed Firebase Auth SDK (no network, no Firebase project).
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => {
  const auth = { name: 'fake-auth' };
  let emit: ((u: unknown) => void) | null = null;
  return {
    auth,
    emitUser: (u: unknown) => emit?.(u),
    onAuthStateChanged: vi.fn((_a: unknown, next: (u: unknown) => void) => {
      emit = next;
      return () => (emit = null);
    }),
    getRedirectResult: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
    signInWithPopup: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
    signInWithRedirect: vi.fn(async (..._a: unknown[]): Promise<unknown> => undefined),
    signInWithEmailAndPassword: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
    createUserWithEmailAndPassword: vi.fn(async (..._a: unknown[]): Promise<{ user: Record<string, unknown> }> => ({ user: {} })),
    updateProfile: vi.fn(async (u: Record<string, unknown>, p: { displayName: string }) => {
      u.displayName = p.displayName;
    }),
    sendPasswordResetEmail: vi.fn(async (..._a: unknown[]) => {}),
    signOut: vi.fn(async (..._a: unknown[]) => {}),
    providers: [] as { params: Record<string, string> }[],
  };
});

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: fb.onAuthStateChanged,
  getRedirectResult: fb.getRedirectResult,
  signInWithPopup: fb.signInWithPopup,
  signInWithRedirect: fb.signInWithRedirect,
  signInWithEmailAndPassword: fb.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: fb.createUserWithEmailAndPassword,
  updateProfile: fb.updateProfile,
  sendPasswordResetEmail: fb.sendPasswordResetEmail,
  signOut: fb.signOut,
  GoogleAuthProvider: class {
    params: Record<string, string> = {};
    constructor() {
      fb.providers.push(this);
    }
    setCustomParameters(p: Record<string, string>) {
      this.params = p;
      return this;
    }
  },
}));
vi.mock('../../firebase', () => ({ firebaseEnabled: true, getFirebaseAuth: () => fb.auth }));

import { AuthProvider, useAuth, type AuthState } from '../../auth/AuthProvider';

const fbErr = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

let auth!: AuthState;
function Probe() {
  auth = useAuth();
  return <p>{auth.loading ? 'loading' : (auth.user?.email ?? 'signed out')}</p>;
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fb.providers.length = 0;
});

describe('AuthProvider with Firebase', () => {
  it('is loading until Firebase reports the restored session', () => {
    mount();
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(auth.firebaseEnabled).toBe(true);
    act(() => fb.emitUser({ uid: 'u1', email: 'ana@example.com', displayName: 'Ana', photoURL: null, providerData: [] }));
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(auth.user).toEqual({ uid: 'u1', email: 'ana@example.com', displayName: 'Ana', photoURL: null });
    act(() => fb.emitUser(null));
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });

  it('signs in with a Google popup that asks which account to use', async () => {
    mount();
    await act(() => auth.signInWithGoogle());
    expect(fb.signInWithPopup).toHaveBeenCalledWith(fb.auth, fb.providers[0]);
    expect(fb.providers[0].params).toEqual({ prompt: 'select_account' });
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('falls back to a redirect where pop-ups are blocked or unsupported', async () => {
    mount();
    for (const code of ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']) {
      fb.signInWithPopup.mockRejectedValueOnce(fbErr(code));
      await act(() => auth.signInWithGoogle());
    }
    expect(fb.signInWithRedirect).toHaveBeenCalledTimes(2);
  });

  it('turns a closed popup into a cancel and other failures into friendly errors', async () => {
    mount();
    fb.signInWithPopup.mockRejectedValueOnce(fbErr('auth/popup-closed-by-user'));
    await expect(auth.signInWithGoogle()).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
    fb.signInWithPopup.mockRejectedValueOnce(fbErr('auth/unauthorized-domain'));
    await expect(auth.signInWithGoogle()).rejects.toThrow(/Authorized domains/);
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
    fb.signInWithEmailAndPassword.mockRejectedValueOnce(fbErr('auth/invalid-credential'));
    await expect(auth.signInWithEmail('ana@example.com', 'x')).rejects.toThrow(/don’t match/);
  });

  it('creates an account with a display name and shows it right away', async () => {
    mount();
    const created = { uid: 'u2', email: 'new@example.com', displayName: null, photoURL: null };
    fb.createUserWithEmailAndPassword.mockResolvedValueOnce({ user: created });
    act(() => fb.emitUser(created));
    await act(() => auth.signUpWithEmail(' new@example.com ', 'secret1', '  Sam '));
    expect(fb.createUserWithEmailAndPassword).toHaveBeenCalledWith(fb.auth, 'new@example.com', 'secret1');
    expect(fb.updateProfile).toHaveBeenCalledWith(created, { displayName: 'Sam' });
    expect(auth.user?.displayName).toBe('Sam');
  });

  it('sends password resets and signs out', async () => {
    mount();
    await act(() => auth.resetPassword(' ana@example.com'));
    expect(fb.sendPasswordResetEmail).toHaveBeenCalledWith(fb.auth, 'ana@example.com');
    await act(() => auth.signOut());
    expect(fb.signOut).toHaveBeenCalledWith(fb.auth);
  });

  it('reports a failed redirect sign-in when the page comes back', async () => {
    fb.getRedirectResult.mockRejectedValueOnce(fbErr('auth/network-request-failed'));
    mount();
    await act(async () => {});
    expect(auth.redirectError).toMatch(/internet connection/);
  });
});
