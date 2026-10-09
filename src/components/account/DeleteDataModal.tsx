import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useData } from '../../data/DataProvider';
import { localStore } from '../../data/localStore';
import { deleteAllUserData } from '../../data/firestoreStore';
import { describeCounts } from '../../lib/backup';
import { Button, Field, Modal } from '../ui';

const WORD = 'DELETE';

/** "Delete all my data", confirmed by typing DELETE. */
export default function DeleteDataModal({ open, onClose, localHasData }: { open: boolean; onClose: () => void; localHasData: boolean }) {
  const { user } = useAuth();
  const { classes, assignments } = useData();
  const [typed, setTyped] = useState('');
  const [alsoLocal, setAlsoLocal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim().toUpperCase() === WORD;

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const run = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await deleteAllUserData(user.uid);
        if (alsoLocal && localHasData) localStore.clear();
      } else {
        localStore.clear();
      }
      setTyped('');
      setBusy(false);
      // with no profile left, the app takes them back to the welcome screen
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Could not delete your data.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Delete all your data?"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} disabled={!ok || busy}>
            {busy ? 'Deleting…' : 'Delete everything'}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <p>
          This permanently deletes your {describeCounts({ classes, assignments })} and your settings{' '}
          {user ? (
            <>
              from your account, on <strong>every device</strong> where you’re signed in
            </>
          ) : (
            <>from this browser</>
          )}
          . It can’t be undone.
        </p>
        <p className="muted small">Want a copy first? Close this and use Export backup.</p>
        {user && localHasData && (
          <label className="check small">
            <input type="checkbox" checked={alsoLocal} onChange={(e) => setAlsoLocal(e.target.checked)} />
            Also delete the data saved in this browser from before you signed in
          </label>
        )}
        <Field label={`Type ${WORD} to confirm`}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={typed !== '' && !ok} />
        </Field>
        {error && (
          <div className="banner banner-error acct-banner" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
