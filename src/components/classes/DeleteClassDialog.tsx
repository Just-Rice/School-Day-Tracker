import { useState } from 'react';
import type { ClassInfo } from '../../types';
import { useData } from '../../data/DataProvider';
import { Button, Modal } from '../ui';
import { errorText, settleSoon } from './saving';

/**
 * "Delete <name>?" If the class has assignments, the user chooses between deleting them too
 * and keeping them without a class.
 */
export default function DeleteClassDialog({
  cls,
  open,
  onClose,
  onDeleting,
  onDeleted,
}: {
  cls: ClassInfo;
  open: boolean;
  onClose: () => void;
  /** called before anything is deleted (the page can keep showing the class meanwhile) */
  onDeleting?: () => void;
  onDeleted: () => void;
}) {
  const { assignments, deleteClass, deleteAssignment, saveAssignment } = useData();
  const [mode, setMode] = useState<'keep' | 'delete'>('keep');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = assignments.filter((a) => a.classId === cls.id);
  const n = linked.length;
  const plural = n === 1 ? 'assignment' : 'assignments';

  const run = async () => {
    setBusy(true);
    setError(null);
    onDeleting?.();
    try {
      // assignments first, so none is left pointing at a deleted class if something fails
      const ops = linked.map((a) => (mode === 'delete' ? deleteAssignment(a.id) : saveAssignment({ ...a, classId: null })));
      await settleSoon(Promise.all(ops));
      await settleSoon(deleteClass(cls.id));
      onDeleted();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Delete ${cls.name || 'this class'}?`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} disabled={busy}>
            {busy ? 'Deleting…' : n > 0 && mode === 'delete' ? `Delete class and ${n} ${plural}` : 'Delete class'}
          </Button>
        </>
      }
    >
      <p className="muted">This removes the class and everything saved about it. It can’t be undone.</p>
      {n > 0 && (
        <fieldset className="cls-fieldset stack">
          <legend className="field-label">
            It has {n} {plural}
          </legend>
          <label className="check">
            <input type="radio" name="del-mode" checked={mode === 'keep'} onChange={() => setMode('keep')} />
            <span>Keep {n === 1 ? 'it' : 'them'} in Homework, without a class</span>
          </label>
          <label className="check">
            <input type="radio" name="del-mode" checked={mode === 'delete'} onChange={() => setMode('delete')} />
            <span>
              Also delete {n === 1 ? 'the' : `all ${n}`} {plural}
            </span>
          </label>
        </fieldset>
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
