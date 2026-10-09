import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useData } from '../../data/DataProvider';
import { Button } from '../ui';
import { countPhrase, shouldOfferDeviceCopy } from './dataOps';
import { dismissDeviceCopy, isDeviceCopyDismissed, useDeviceCopy } from './useDeviceCopy';
import '../../pages/account.css';

/**
 * Shown at the top of the app right after someone signs in to an empty account on a device
 * where they used the app without one: offers to move that data into the account.
 */
export default function ImportLocalDataBanner() {
  const { user } = useAuth();
  const { loading, classes, assignments } = useData();
  const dc = useDeviceCopy();
  // bumped to re-read the dismissal from storage
  const [, setDismissTick] = useState(0);
  const uid = user?.uid;

  const offered = shouldOfferDeviceCopy({
    accountStore: dc.accountStore,
    loading,
    accountItems: classes.length + assignments.length,
    localItems: dc.local.classes + dc.local.assignments,
    dismissed: isDeviceCopyDismissed(uid),
  });
  // Once the banner has made its offer it stays up to finish the conversation, even though the
  // account isn't empty any more after copying. (A copy started from Settings while the banner
  // never showed doesn't make it appear.)
  const [engaged, setEngaged] = useState(false);
  if (offered && !engaged) setEngaged(true);
  const inProgress = engaged && dc.phase !== 'idle' && !isDeviceCopyDismissed(uid);
  if (!uid || (!offered && !inProgress)) return null;

  const dismiss = () => {
    dismissDeviceCopy(uid);
    setDismissTick((n) => n + 1);
  };

  let text;
  let actions;
  if (dc.phase === 'cleared') {
    text = <>All set: your account has everything, and this browser no longer keeps a separate copy.</>;
    actions = (
      <Button small onClick={dismiss}>
        Close
      </Button>
    );
  } else if (dc.phase === 'copied') {
    const n = dc.copied ? countPhrase(dc.copied.classes, dc.copied.assignments) : 'your data';
    text = (
      <>
        <strong>Copied {n === 'nothing new' ? 'everything' : n} to your account.</strong> Remove the copy saved in this browser from before you signed in? Your account keeps all of it.
      </>
    );
    actions = (
      <>
        <Button small variant="primary" onClick={dc.clearLocal}>
          Remove from this browser
        </Button>
        <Button small onClick={dismiss}>
          Keep it
        </Button>
      </>
    );
  } else {
    text = (
      <>
        This device has <strong>{countPhrase(dc.local.classes, dc.local.assignments)}</strong> from before you signed in. Copy {dc.local.classes + dc.local.assignments === 1 ? 'it' : 'them'} to your
        account so {dc.local.classes + dc.local.assignments === 1 ? 'it syncs' : 'they sync'} to your other devices?
      </>
    );
    actions = (
      <>
        <Button small variant="primary" onClick={() => void dc.copy()} disabled={dc.phase === 'copying'}>
          {dc.phase === 'copying' ? 'Copying…' : 'Copy to my account'}
        </Button>
        <Button small variant="ghost" onClick={dismiss} disabled={dc.phase === 'copying'}>
          Not now
        </Button>
      </>
    );
  }

  return (
    <section className="banner banner-info acct-import-banner" aria-label="Data on this device" aria-live="polite">
      <p>{text}</p>
      <div className="row">{actions}</div>
      {dc.error && (
        <p className="acct-error-text" role="alert">
          {dc.error}
        </p>
      )}
    </section>
  );
}
