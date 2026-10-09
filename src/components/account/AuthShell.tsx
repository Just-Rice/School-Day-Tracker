import type { CSSProperties, ReactNode } from 'react';

/** Full-screen frame for the pages outside the app layout (sign in, welcome). */
export default function AuthShell({ children, wide, accent }: { children: ReactNode; wide?: boolean; accent?: string }) {
  const style = accent ? ({ '--school': accent } as CSSProperties) : undefined;
  return (
    <div className="acct-screen" style={style}>
      <main className={'acct-panel' + (wide ? ' acct-panel-wide' : '')} id="main">
        <div className="acct-brand">
          <span className="acct-brand-mark" aria-hidden>
            ◷
          </span>
          <span className="acct-brand-name">School Day Tracker</span>
        </div>
        {children}
      </main>
    </div>
  );
}
