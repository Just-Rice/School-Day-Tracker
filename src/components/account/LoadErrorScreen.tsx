import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Card } from '../ui';
import AuthShell from './AuthShell';
import '../../pages/account.css';

/**
 * Shown instead of the app when the signed-in account's data can't be loaded at all: nothing is
 * saved on this device yet and the sync server refused (daily quota used up, rules missing, ...).
 * Signing out goes back to the data saved in this browser.
 */
export default function LoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const out = async () => {
    setBusy(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (e) {
      setSignOutError((e as Error).message || 'Could not sign out. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Card>
        <h1 className="acct-title">Couldn’t load your data</h1>
        <p>
          Your schedule, classes and homework couldn’t be loaded from your account{user?.email ? <> ({user.email})</> : null}.
        </p>
        <div className="banner banner-error acct-banner" role="alert">
          {message}
        </div>
        <p className="muted small">Try again in a little while. Or sign out to use the app with what’s saved in this browser; you can sign in again later.</p>
        <div className="row acct-actions">
          <Button variant="primary" onClick={onRetry} disabled={busy}>
            Try again
          </Button>
          <Button onClick={() => void out()} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
        {signOutError && (
          <p className="acct-error-text small" role="alert">
            {signOutError}
          </p>
        )}
      </Card>
    </AuthShell>
  );
}
