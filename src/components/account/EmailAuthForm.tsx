import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Button, Field } from '../ui';

export type EmailMode = 'signin' | 'signup' | 'reset';

const TABS: { id: EmailMode; label: string }[] = [
  { id: 'signin', label: 'Sign in' },
  { id: 'signup', label: 'Create account' },
  { id: 'reset', label: 'Forgot password' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email + password sign in / sign up / reset, as three tabs. */
export default function EmailAuthForm({ initialMode = 'signin' }: { initialMode?: EmailMode }) {
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<EmailMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (m: EmailMode) => {
    setMode(m);
    setError(null);
    setSentTo(null);
  };

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + TABS.length) % TABS.length;
    pick(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setError('Enter your email address, like name@example.com.');
    if (mode !== 'reset' && !password) return setError('Enter your password.');
    if (mode === 'signup' && password.length < 6) return setError('Pick a password with at least 6 characters.');
    setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmail(em, password);
      else if (mode === 'signup') await signUpWithEmail(em, password, name.trim() || undefined);
      else {
        await resetPassword(em);
        setSentTo(em);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';
  const busyLabel = mode === 'signin' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : 'Sending…';

  return (
    <div className="acct-email">
      <div className="acct-tabs" role="tablist" aria-label="Email sign-in options">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={mode === t.id}
            aria-controls={`${id}-panel`}
            tabIndex={mode === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${mode}`} className="stack acct-form" onSubmit={submit} noValidate>
        {mode === 'reset' && <p className="muted small">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>}
        {mode === 'signup' && (
          <Field label="Your name" hint="Optional. Shown in the app, not to anyone else.">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
        </Field>
        {mode !== 'reset' && (
          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters. Don’t reuse your school password.' : undefined}>
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 6 : undefined}
              required
            />
          </Field>
        )}
        {mode !== 'reset' && (
          <div className="row acct-form-extras">
            <label className="check small">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
            </label>
            {mode === 'signin' && (
              <button type="button" className="acct-link small" onClick={() => pick('reset')}>
                Forgot password?
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="banner banner-error acct-banner" role="alert">
            {error}
          </div>
        )}
        {sentTo && (
          <div className="banner banner-info acct-banner" role="status">
            If there’s an account for <strong>{sentTo}</strong>, a reset link is on its way. Check your inbox (and spam folder), then come back and sign in.
          </div>
        )}
        <Button type="submit" variant="primary" className="acct-submit" disabled={busy}>
          {busy ? busyLabel : label}
        </Button>
      </form>
    </div>
  );
}
