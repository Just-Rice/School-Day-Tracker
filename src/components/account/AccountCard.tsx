import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Card, Chip } from '../ui';
import Avatar from './Avatar';

export default function AccountCard() {
  const { user, firebaseEnabled, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const out = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title="Account" className="acct-card">
      {user ? (
        <div className="acct-who">
          <Avatar name={user.displayName} email={user.email} photoURL={user.photoURL} />
          <div className="acct-who-text">
            <strong>{user.displayName || user.email}</strong>
            {user.displayName && user.email && <span className="muted small">{user.email}</span>}
            <span>
              <Chip color="var(--ok)">✓ Syncing across your devices</Chip>
            </span>
          </div>
          <Button onClick={out} disabled={busy} className="acct-who-action">
            {busy ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      ) : firebaseEnabled ? (
        <div className="stack">
          <p>You’re not signed in, so your classes and homework are saved on <strong>this device only</strong>.</p>
          <p className="muted small">Sign in with Google or email to back them up and see them on your phone, laptop and Chromebook.</p>
          <div className="row">
            <Button variant="primary" onClick={() => navigate('/login', { state: { from: '/settings' } })}>
              Sign in or create an account
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p>
            This copy of the app runs in <strong>local mode</strong>: everything is saved in this browser on this device, and nothing is sent anywhere.
          </p>
          <p className="muted small">To move your data to another device or browser, export a backup below and import it there.</p>
        </div>
      )}
      {error && (
        <div className="banner banner-error acct-banner" role="alert">
          {error}
        </div>
      )}
    </Card>
  );
}
