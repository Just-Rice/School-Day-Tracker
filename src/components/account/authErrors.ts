// Turns Firebase auth/* error codes into messages a student can act on.

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password don’t match. Check them and try again, or reset your password.',
  'auth/wrong-password': 'That password isn’t right. Try again, or reset your password.',
  'auth/user-not-found': 'There’s no account with that email. Check the spelling or create an account.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead (or reset your password).',
  'auth/weak-password': 'Pick a stronger password: at least 6 characters.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before you finished.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before you finished.',
  'auth/user-cancelled': 'Sign-in was cancelled.',
  'auth/redirect-cancelled-by-user': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/network-request-failed': 'Couldn’t reach the sign-in service. Check your internet connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again (or reset your password).',
  'auth/user-disabled': 'This account has been turned off.',
  'auth/account-exists-with-different-credential': 'An account with this email already exists with a different sign-in method. Sign in the way you did before.',
  'auth/operation-not-allowed': 'This sign-in method isn’t turned on for this app yet (enable it in the Firebase console under Authentication → Sign-in method).',
  'auth/admin-restricted-operation': 'This sign-in method isn’t turned on for this app yet.',
  'auth/unauthorized-domain': 'This website isn’t allowed to use sign-in yet. The app’s owner needs to add this domain in the Firebase console (Authentication → Settings → Authorized domains).',
  'auth/invalid-api-key': 'This copy of the app has an invalid Firebase API key, so sign-in can’t work. Check the VITE_FIREBASE_* settings.',
  'auth/web-storage-unsupported': 'Sign-in needs cookies and site storage. Turn them on for this site (or leave private browsing) and try again.',
  'auth/operation-not-supported-in-this-environment': 'This browser can’t open the sign-in window. Try another browser, or use email and password.',
  'auth/requires-recent-login': 'For your security, sign out and sign back in, then try again.',
  'auth/internal-error': 'Something went wrong while signing in. Try again in a moment.',
};

/** the auth/* code of a Firebase error, if it has one */
export function authErrorCode(e: unknown): string | undefined {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** A friendly sentence for any error thrown by Firebase auth (or anything else). */
export function friendlyAuthError(e: unknown): string {
  const code = authErrorCode(e);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code === 'auth/invalid-login-credentials') return MESSAGES['auth/invalid-credential'];
  if (code?.startsWith('auth/')) return `Sign-in didn’t work (${code.slice(5).replace(/-/g, ' ')}). Try again.`;
  const msg = e instanceof Error ? e.message : '';
  return msg && !msg.startsWith('Firebase:') ? msg : 'Something went wrong. Try again.';
}

/** Errors that just mean "the person changed their mind"; not worth a red banner. */
export function isCancelled(e: unknown): boolean {
  const code = authErrorCode(e);
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled' || code === 'auth/redirect-cancelled-by-user';
}

/** A friendly Error carrying the original auth code (so callers can still branch on it). */
export class AuthError extends Error {
  readonly code?: string;
  constructor(e: unknown) {
    super(friendlyAuthError(e));
    this.name = 'AuthError';
    this.code = authErrorCode(e);
  }
}
