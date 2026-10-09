import { version } from '../../../package.json';
import { Card } from '../ui';

// a build can stamp its own version (e.g. a commit) through VITE_APP_VERSION
const VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || version;

export default function AboutCard() {
  return (
    <Card title="About" className="acct-card">
      <dl className="kv">
        <dt>App</dt>
        <dd>School Day Tracker {VERSION}</dd>
        <dt>3D models</dt>
        <dd>
          <a href="https://just-rice.github.io/hsn-3d/" target="_blank" rel="noreferrer">
            HSN in 3D
          </a>
          {' · '}
          <a href="https://just-rice.github.io/cms-3d/" target="_blank" rel="noreferrer">
            CMS in 3D
          </a>
        </dd>
        <dt>Source</dt>
        <dd>
          <a href="https://github.com/Just-Rice/School-Day-Tracker" target="_blank" rel="noreferrer">
            github.com/Just-Rice/School-Day-Tracker
          </a>
        </dd>
        <dt>Privacy</dt>
        <dd>
          Your data is only visible to you. Signed in, it’s stored in your own private space in the app’s database, which no other account can read; otherwise it never leaves this browser. No ads, no
          tracking.
        </dd>
      </dl>
      <p className="muted small acct-disclaimer">Not an official WW-P district app. Check school announcements for schedule changes.</p>
    </Card>
  );
}
