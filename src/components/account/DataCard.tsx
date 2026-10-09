import { useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useData } from '../../data/DataProvider';
import { backupFileName, describeCounts, downloadBackup, makeBackup, MAX_BACKUP_BYTES, parseBackup, type ParsedBackup } from '../../lib/backup';
import { Button, Card } from '../ui';
import DeleteDataModal from './DeleteDataModal';
import ImportBackupModal from './ImportBackupModal';
import { countPhrase } from './dataOps';
import { useDeviceCopy } from './useDeviceCopy';

/** Settings → Your data: export / import a backup, move this device's data, delete everything. */
export default function DataCard() {
  const { user } = useAuth();
  const { store, profile, classes, assignments } = useData();
  const dc = useDeviceCopy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<{ backup: ParsedBackup; name: string } | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const where = store.kind === 'firestore' ? 'your account' : 'this browser';

  const exportNow = () => {
    setExportError(null);
    try {
      const name = backupFileName();
      downloadBackup(makeBackup({ profile, classes, assignments }), name);
      setExported(name);
    } catch {
      setExportError('Could not create the backup file in this browser.');
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // let the same file be picked again after a failed attempt
    e.target.value = '';
    if (!file) return;
    setImportMsg(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setImportMsg({ ok: false, text: 'That file is too big to be a School Day Tracker backup.' });
      return;
    }
    try {
      setIncoming({ backup: parseBackup(await file.text()), name: file.name });
    } catch (err) {
      setImportMsg({ ok: false, text: (err as Error).message || 'Could not read that file.' });
    }
  };

  const showCopy = dc.available || (dc.accountStore && dc.phase !== 'idle');

  return (
    <Card title="Your data" className="acct-card">
      <ul className="acct-data">
        <li>
          <div className="acct-data-text">
            <strong>Export backup</strong>
            <p className="muted small">Download {describeCounts({ classes, assignments })} and your settings as one file. Keep it somewhere safe, or use it to move to another browser.</p>
          </div>
          <div className="acct-data-actions">
            <Button onClick={exportNow}>Export backup</Button>
          </div>
          {exported && (
            <p className="acct-data-result small" role="status">
              ✓ Saved <span className="acct-file">{exported}</span> to your downloads.
            </p>
          )}
          {exportError && (
            <p className="acct-error-text small" role="alert">
              {exportError}
            </p>
          )}
        </li>

        <li>
          <div className="acct-data-text">
            <strong>Import backup</strong>
            <p className="muted small">Restore a backup file into {where}. You’ll choose whether to merge it with what’s here or replace everything.</p>
          </div>
          <div className="acct-data-actions">
            <Button onClick={() => fileRef.current?.click()}>Import backup…</Button>
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e)} />
          </div>
          {importMsg && (
            <p className={importMsg.ok ? 'acct-data-result small' : 'acct-error-text small'} role={importMsg.ok ? 'status' : 'alert'}>
              {importMsg.ok ? '✓ ' : ''}
              {importMsg.text}
            </p>
          )}
        </li>

        {showCopy && (
          <li>
            <div className="acct-data-text">
              <strong>This device’s data</strong>
              {dc.phase === 'cleared' ? (
                <p className="muted small">Removed from this browser. Your account has everything.</p>
              ) : dc.phase === 'copied' ? (
                <p className="small" role="status">
                  ✓ Copied {dc.copied && countPhrase(dc.copied.classes, dc.copied.assignments) !== 'nothing new' ? countPhrase(dc.copied.classes, dc.copied.assignments) : 'everything'} to your
                  account. You can now remove the separate copy kept in this browser.
                </p>
              ) : (
                <p className="muted small">
                  This browser still has {countPhrase(dc.local.classes, dc.local.assignments)} saved from before you signed in. Copy {dc.local.classes + dc.local.assignments === 1 ? 'it' : 'them'} to
                  your account; anything your account already has a newer version of is left alone.
                </p>
              )}
            </div>
            <div className="acct-data-actions">
              {dc.phase === 'copied' ? (
                <Button onClick={dc.clearLocal}>Remove from this browser</Button>
              ) : dc.phase !== 'cleared' ? (
                <Button variant="primary" onClick={() => void dc.copy()} disabled={dc.phase === 'copying'}>
                  {dc.phase === 'copying' ? 'Copying…' : 'Copy to my account'}
                </Button>
              ) : null}
            </div>
            {dc.error && (
              <p className="acct-error-text small" role="alert">
                {dc.error}
              </p>
            )}
          </li>
        )}

        <li>
          <div className="acct-data-text">
            <strong className="acct-danger-title">Delete all my data</strong>
            <p className="muted small">Permanently erase your classes, homework and settings {user ? 'from your account on every device' : 'from this browser'}.</p>
          </div>
          <div className="acct-data-actions">
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete…
            </Button>
          </div>
        </li>
      </ul>

      <ImportBackupModal
        backup={incoming?.backup ?? null}
        fileName={incoming?.name ?? ''}
        onClose={() => setIncoming(null)}
        onDone={(text) => {
          setIncoming(null);
          setImportMsg({ ok: true, text });
        }}
      />
      <DeleteDataModal open={deleting} onClose={() => setDeleting(false)} localHasData={dc.local.classes + dc.local.assignments > 0} />
    </Card>
  );
}
