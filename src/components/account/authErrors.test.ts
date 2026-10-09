import { describe, expect, it } from 'vitest';
import { AuthError, authErrorCode, friendlyAuthError, isCancelled } from './authErrors';

const fbErr = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

describe('friendlyAuthError', () => {
  it('explains common sign-in problems', () => {
    expect(friendlyAuthError(fbErr('auth/invalid-credential'))).toMatch(/don’t match/);
    expect(friendlyAuthError(fbErr('auth/wrong-password'))).toMatch(/password isn’t right/);
    expect(friendlyAuthError(fbErr('auth/user-not-found'))).toMatch(/no account/);
    expect(friendlyAuthError(fbErr('auth/email-already-in-use'))).toMatch(/already exists/);
    expect(friendlyAuthError(fbErr('auth/weak-password'))).toMatch(/at least 6/);
    expect(friendlyAuthError(fbErr('auth/popup-closed-by-user'))).toMatch(/closed/);
    expect(friendlyAuthError(fbErr('auth/network-request-failed'))).toMatch(/internet/);
    expect(friendlyAuthError(fbErr('auth/too-many-requests'))).toMatch(/Too many attempts/);
    expect(friendlyAuthError(fbErr('auth/unauthorized-domain'))).toMatch(/Authorized domains/);
  });

  it('falls back to something readable for unknown codes and plain errors', () => {
    expect(friendlyAuthError(fbErr('auth/some-new-thing'))).toBe('Sign-in didn’t work (some new thing). Try again.');
    expect(friendlyAuthError(new Error('Plain message'))).toBe('Plain message');
    expect(friendlyAuthError(new Error('Firebase: internal stuff'))).toBe('Something went wrong. Try again.');
    expect(friendlyAuthError(undefined)).toBe('Something went wrong. Try again.');
  });
});

describe('isCancelled / authErrorCode / AuthError', () => {
  it('treats closing the popup as a cancel, not a failure', () => {
    expect(isCancelled(fbErr('auth/popup-closed-by-user'))).toBe(true);
    expect(isCancelled(fbErr('auth/cancelled-popup-request'))).toBe(true);
    expect(isCancelled(fbErr('auth/network-request-failed'))).toBe(false);
  });

  it('keeps the code on the friendly error', () => {
    const e = new AuthError(fbErr('auth/weak-password'));
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('auth/weak-password');
    expect(authErrorCode(e)).toBe('auth/weak-password');
    expect(e.message).toMatch(/stronger password/);
  });
});
