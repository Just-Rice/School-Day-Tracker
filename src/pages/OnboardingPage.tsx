import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useAppearance } from '../components/Layout';
import { Button, Card, Field, Spinner } from '../components/ui';
import AuthShell from '../components/account/AuthShell';
import GoogleButton from '../components/account/GoogleButton';
import SchoolPicker from '../components/account/SchoolPicker';
import { isCancelled } from '../components/account/authErrors';
import { gradeFor, gradeLabel, gradeOptions } from '../components/account/grades';
import { clearDraft, loadDraft, saveDraft, type OnboardingDraft } from '../components/account/onboardingDraft';
import { useData } from '../data/DataProvider';
import { SCHOOLS } from '../schools';
import './account.css';

const LOGIN_STATE = { from: '/welcome' };

export default function OnboardingPage() {
  useAppearance();
  const { user, loading: authLoading, firebaseEnabled, signInWithGoogle } = useAuth();
  const { profile, classes, loading, saveProfile } = useData();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<OnboardingDraft>(() => loadDraft() ?? { step: 1, schoolId: 'hsn', displayName: '' });
  const [finishing, setFinishing] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(draft.step);

  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => saveDraft(draft), [draft]);

  // move focus to the new step's heading (not on first load) so screen readers follow along
  useEffect(() => {
    if (draft.step !== shownStep.current) headingRef.current?.focus();
    shownStep.current = draft.step;
  }, [draft.step]);

  // prefill the name from the account once someone signs in
  const accountName = user?.displayName ?? '';
  useEffect(() => {
    if (accountName) setDraft((d) => (d.displayName ? d : { ...d, displayName: accountName }));
  }, [accountName]);

  const alreadyDone = !authLoading && !loading && profile.onboarded && !finishing;
  useEffect(() => {
    if (alreadyDone) clearDraft();
  }, [alreadyDone]);

  if (authLoading || (loading && !finishing)) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }
  // set up already (e.g. they signed in to an account that has a profile): straight to the app
  if (alreadyDone) return <Navigate to="/" replace />;

  const school = SCHOOLS[draft.schoolId];
  const hasAccountStep = firebaseEnabled && (!user || draft.step === 3);
  const total = hasAccountStep ? 3 : 2;
  const grades = gradeOptions(draft.schoolId);
  const nextPath = classes.length ? '/' : '/classes/new';

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await saveProfile({
        schoolId: draft.schoolId,
        grade: gradeFor(draft.schoolId, draft.grade),
        displayName: draft.displayName.trim() || undefined,
        onboarded: true,
      });
      clearDraft();
      navigate(nextPath, { replace: true, state: { welcome: true } });
    } catch (e) {
      setFinishing(false);
      setError((e as Error).message || 'Could not save your choices. Try again.');
    }
  };

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

  const finishLabel = finishing ? 'Saving…' : classes.length ? 'Finish' : 'Next: add your classes';
  const nextNote = !classes.length && (
    <p className="muted small acct-next-note">
      Next you’ll add your first class: its name, period, room and teacher. Each one takes about a minute.
    </p>
  );

  let body;
  if (draft.step === 1) {
    body = (
      <>
        <h1 className="acct-title acct-step-title" ref={headingRef} tabIndex={-1}>
          Welcome! Which school do you go to?
        </h1>
        <p className="muted">Your bell schedule, classes and homework in one place{draft.schoolId === 'other' ? '.' : ', plus a map that walks you to every room.'}</p>
        <SchoolPicker value={draft.schoolId} onChange={(schoolId) => update({ schoolId, grade: gradeFor(schoolId, draft.grade) })} />
        <div className="acct-step-foot">
          {firebaseEnabled && !user ? (
            <button type="button" className="acct-link small" onClick={() => navigate('/login', { state: LOGIN_STATE })}>
              Already have an account? Sign in
            </button>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={() => update({ step: 2 })}>
            Next
          </Button>
        </div>
      </>
    );
  } else if (draft.step === 2) {
    body = (
      <>
        <h1 className="acct-title acct-step-title" ref={headingRef} tabIndex={-1}>
          A little about you
        </h1>
        <p className="muted">Both are optional; they just make the app feel like yours.</p>
        <div className="form-grid">
          <Field label="What should we call you?">
            <input value={draft.displayName} onChange={(e) => update({ displayName: e.target.value })} autoComplete="given-name" maxLength={80} placeholder="Your first name" />
          </Field>
          <Field label={`Grade at ${school.short === 'Other' ? 'your school' : school.short}`}>
            <select value={draft.grade ?? ''} onChange={(e) => update({ grade: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Prefer not to say</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!hasAccountStep && nextNote}
        <div className="acct-step-foot">
          <Button variant="ghost" onClick={() => update({ step: 1 })}>
            Back
          </Button>
          {hasAccountStep ? (
            <Button variant="primary" onClick={() => update({ step: 3 })}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={finishing}>
              {finishLabel}
            </Button>
          )}
        </div>
      </>
    );
  } else if (user) {
    body = (
      <>
        <h1 className="acct-title acct-step-title" ref={headingRef} tabIndex={-1}>
          You’re signed in
        </h1>
        <p>
          Signed in as <strong>{user.email ?? user.displayName}</strong>. Your schedule and homework will sync to every phone and computer where you sign in.
        </p>
        {nextNote}
        <div className="acct-step-foot">
          <Button variant="ghost" onClick={() => update({ step: 2 })}>
            Back
          </Button>
          <Button variant="primary" onClick={finish} disabled={finishing}>
            {finishLabel}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="acct-title acct-step-title" ref={headingRef} tabIndex={-1}>
          Sync across your devices?
        </h1>
        <p className="muted">Sign in to keep your schedule and homework on your phone, laptop and Chromebook. Without an account, everything stays on this device.</p>
        <div className="stack acct-choices">
          <GoogleButton onClick={google} disabled={googleBusy || finishing} busy={googleBusy} />
          <Button onClick={() => navigate('/login', { state: LOGIN_STATE })} disabled={finishing}>
            Use email instead
          </Button>
          <Button variant="ghost" onClick={finish} disabled={finishing}>
            {finishing ? 'Saving…' : 'Use on this device only'}
          </Button>
        </div>
        <p className="muted small acct-note">WW-P students can use their school Google account if the district allows it. You can always sign in later from Settings.</p>
        <div className="acct-step-foot">
          <Button variant="ghost" onClick={() => update({ step: 2 })}>
            Back
          </Button>
          <span />
        </div>
      </>
    );
  }

  return (
    <AuthShell wide accent={school.color}>
      <div className="acct-progress" aria-label={`Step ${draft.step} of ${total}`} role="img">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={'acct-progress-dot' + (i < draft.step ? ' is-done' : '')} />
        ))}
        <span className="muted small" aria-hidden>
          Step {draft.step} of {total}
        </span>
      </div>
      <Card className="acct-step">
        {body}
        {error && (
          <div className="banner banner-error acct-banner" role="alert">
            {error}
          </div>
        )}
      </Card>
    </AuthShell>
  );
}
