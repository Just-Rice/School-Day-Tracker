import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useAppearance } from '../components/Layout';
import { Button, Card, Spinner } from '../components/ui';
import AuthShell from '../components/account/AuthShell';
import EmailAuthForm from '../components/account/EmailAuthForm';
import GoogleButton from '../components/account/GoogleButton';
import { isCancelled } from '../components/account/authErrors';
import { useData } from '../data/DataProvider';
import { SCHOOLS } from '../schools';
import './account.css';

/** where to go after signing in: the page that sent us here, never back to /login */
export function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/';
}

export default function LoginPage() {
  useAppearance();
  const { user, loading, firebaseEnabled, signInWithGoogle, redirectError } = useAuth();
  const { profile } = useData();
  const loc = useLocation();
  const navigate = useNavigate();
  const from = returnPath(loc.state);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = SCHOOLS[profile.schoolId]?.color;

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Checking your sign-in…" />
      </div>
    );
  }
  if (user) return <Navigate to={from} replace />;

  if (!firebaseEnabled) {
    return (
      <AuthShell accent={accent}>
        <Card>
          <h1 className="acct-title">Accounts aren’t set up here</h1>
          <p>This copy of School Day Tracker runs in <strong>local mode</strong>: your classes, homework and settings are saved in this browser on this device only. Nothing is sent anywhere.</p>
          <p className="muted small">To move your data to another device, use <strong>Settings → Export backup</strong> here and <strong>Import backup</strong> there. Signing in and syncing work on copies of the app that have a Firebase project set up.</p>
          <div className="row acct-actions">
            <Link className="btn btn-primary" to={from} replace>
              Back to the app
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  const google = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      if (!isCancelled(e)) setError((e as Error).message);
    } finally {
      setGoogleBusy(false);
    }
  };

  const shownError = error ?? redirectError;

  return (
    <AuthShell accent={accent}>
      <Card>
        <h1 className="acct-title">Sign in</h1>
        <p className="muted">Sync your schedule, classes and homework across your phone, laptop and Chromebook.</p>
        <div className="stack acct-google-block">
          <GoogleButton onClick={google} disabled={googleBusy} busy={googleBusy} />
          <p className="muted small acct-note">WW-P students: you can use your school Google account, if the district allows it, or any personal Google account.</p>
          {shownError && (
            <div className="banner banner-error acct-banner" role="alert">
              {shownError}
            </div>
          )}
        </div>
        <div className="acct-or" role="separator">
          <span>or use email</span>
        </div>
        <EmailAuthForm />
      </Card>
      <div className="acct-skip">
        <Button variant="ghost" onClick={() => navigate(from, { replace: true })}>
          Continue without an account
        </Button>
        <p className="muted small">Everything is saved on this device only. You can sign in later from Settings.</p>
      </div>
    </AuthShell>
  );
}
