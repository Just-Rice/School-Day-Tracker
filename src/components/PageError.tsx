import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { Button, Card, Page } from './ui';

/**
 * Shown in place of a page that crashed while rendering (e.g. on data it didn't expect), so one
 * bad record doesn't take down the whole app: inside the layout the nav still works.
 */
export default function PageError({ full }: { full?: boolean }) {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  const body = (
    <Page title="Something went wrong">
      <Card>
        <div className="stack">
          <p>This page hit a problem and couldn’t be shown. Your data is still saved.</p>
          {message && <p className="muted small mono">{message}</p>}
          <div className="row">
            <Link className="btn btn-primary" to="/">
              Go to Today
            </Link>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </Card>
    </Page>
  );
  return full ? <div className="main">{body}</div> : body;
}
