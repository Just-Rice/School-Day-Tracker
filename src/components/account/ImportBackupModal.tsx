import { useState } from 'react';
import { useData } from '../../data/DataProvider';
import { describeCounts, planImport, type ParsedBackup } from '../../lib/backup';
import { Button, Modal } from '../ui';
import { applyImport, countPhrase } from './dataOps';

type Mode = 'merge' | 'replace';

function exportedOn(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Shows what's in a backup file and applies it as a merge or a full replace. */
export default function ImportBackupModal({ backup, fileName, onClose, onDone }: { backup: ParsedBackup | null; fileName: string; onClose: () => void; onDone: (message: string) => void }) {
  const { store, profile, classes, assignments } = useData();
  const [mode, setMode] = useState<Mode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    setMode('merge');
    onClose();
  };

  const plan = backup ? planImport({ classes, assignments }, backup, mode) : null;
  const when = exportedOn(backup?.exportedAt);
  const where = store.kind === 'firestore' ? 'your account' : 'this device';

  const run = async () => {
    if (!backup) return;
    setBusy(true);
    setError(null);
    try {
      const res = await applyImport(store, { profile, classes, assignments }, backup, mode);
      const parts = [`Imported ${res.saved ? `${res.saved} ${res.saved === 1 ? 'item' : 'items'}` : 'no new items'}`];
      if (res.deleted) parts.push(`removed ${res.deleted}`);
      if (res.profileChanged) parts.push(mode === 'replace' ? 'restored your settings' : 'added missing settings');
      setMode('merge');
      onDone(parts.join(', ') + '.');
    } catch (e) {
      setError((e as Error).message || 'Could not import the backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!backup}
      onClose={close}
      title="Import backup"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} onClick={run} disabled={busy}>
            {busy ? 'Importing…' : mode === 'replace' ? 'Replace my data' : 'Merge into my data'}
          </Button>
        </>
      }
    >
      {backup && plan && (
        <div className="stack">
          <p>
            <strong className="acct-file">{fileName}</strong>
            <br />
            <span className="muted small">
              {describeCounts(backup)}
              {backup.profile ? ', settings' : ''}
              {when ? ` · saved ${when}` : ''}
            </span>
          </p>
          {backup.warnings.length > 0 && (
            <div className="banner banner-warn acct-banner" role="status">
              <ul className="acct-bullets">
                {backup.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <fieldset className="acct-fieldset acct-modes">
            <legend className="field-label">How should it be added to {where}?</legend>
            <label className={'acct-mode' + (mode === 'merge' ? ' is-selected' : '')}>
              <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <strong>Merge</strong>
                <span className="muted small">Keep everything you have and add what’s in the file. When both have the same class or assignment, the more recently edited one wins.</span>
              </span>
            </label>
            <label className={'acct-mode' + (mode === 'replace' ? ' is-selected' : '')}>
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <strong>Replace</strong>
                <span className="muted small">Make {where} match the file exactly: classes and assignments that aren’t in it are deleted, and your settings are restored from it.</span>
              </span>
            </label>
          </fieldset>
          <p className="small" role="status">
            {mode === 'merge'
              ? `This will add or update ${countPhrase(plan.saveClasses.length, plan.saveAssignments.length)}.`
              : `This will save ${countPhrase(plan.saveClasses.length, plan.saveAssignments.length)}${
                  plan.deleteClasses.length + plan.deleteAssignments.length ? ` and delete ${countPhrase(plan.deleteClasses.length, plan.deleteAssignments.length)}` : ''
                }.`}
          </p>
          {error && (
            <div className="banner banner-error acct-banner" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
