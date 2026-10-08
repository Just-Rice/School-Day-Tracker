import { useCallback, useState, type ReactNode } from 'react';
import { Button, Modal } from '../ui';

interface Ask {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  run: () => void;
}

/** A confirm dialog: `ask({...})` opens it, render `modal` once somewhere in the component. */
export function useConfirm(): [(a: Ask) => void, ReactNode] {
  const [state, setState] = useState<Ask | null>(null);
  const ask = useCallback((a: Ask) => setState(a), []);
  const close = () => setState(null);
  const modal = (
    <Modal
      open={!!state}
      onClose={close}
      title={state?.title ?? ''}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              state?.run();
              close();
            }}
          >
            {state?.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <p>{state?.body}</p>
    </Modal>
  );
  return [ask, modal];
}
