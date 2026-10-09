import { useState } from 'react';

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (name && parts[1] ? parts[1][0] : '')).toUpperCase();
}

/** The account photo, or initials when there is none (or it fails to load). */
export default function Avatar({ name, email, photoURL, size = 44 }: { name?: string | null; email?: string | null; photoURL?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (photoURL && !broken) return <img className="acct-avatar" src={photoURL} alt="" style={style} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return (
    <span className="acct-avatar acct-avatar-initials" style={style} aria-hidden>
      {initials(name, email)}
    </span>
  );
}
