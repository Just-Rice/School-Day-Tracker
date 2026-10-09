import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { SIGN_OUT_STATE } from '../../pages/LoginPage';
import { Button, Card, Chip } from '../ui';
import Avatar from './Avatar';

export default function AccountCard() {
  const { user, firebaseEnabled } = useAuth();
  const navigate = useNavigate();
  // the sign-in page does the signing out (see SIGN_OUT_STATE) and then offers to sign in again
  const out = () => navigate('/login', { replace: true, state: SIGN_OUT_STATE });

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
          <Button onClick={out} className="acct-who-action">
            Sign out
          </Button>
        </div>
      ) : firebaseEnabled ? (
        <div className="stack">
          <p>
            You’re not signed in, so your classes and homework are saved on <strong>this device only</strong>.
          </p>
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
    </Card>
  );
}
