import { useEffect, type MouseEvent } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useData } from '../data/DataProvider';
import { SCHOOLS } from '../schools';
import { Spinner } from './ui';
import ImportLocalDataBanner from './account/ImportLocalDataBanner';

const NAV = [
  { to: '/', label: 'Today', icon: '◷', end: true },
  { to: '/week', label: 'Week', icon: '▦' },
  { to: '/classes', label: 'Classes', icon: '◫' },
  { to: '/homework', label: 'Homework', icon: '✓' },
  { to: '/map', label: 'Map', icon: '⌖' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

/**
 * The skip link focuses <main> itself: with hash routes, following href="#main" would be a
 * navigation to the route /main (an unknown route, so Today).
 */
function skipToMain(e: MouseEvent) {
  e.preventDefault();
  document.getElementById('main')?.focus();
}

/** Applies the theme and school accent to <html> */
export function useAppearance() {
  const { profile } = useData();
  useEffect(() => {
    const root = document.documentElement;
    if (profile.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', profile.theme);
    root.style.setProperty('--school', SCHOOLS[profile.schoolId]?.color ?? '#1f45a8');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SCHOOLS[profile.schoolId]?.color ?? '#1f45a8');
  }, [profile.theme, profile.schoolId]);
}

export default function Layout() {
  const { user, loading: authLoading, firebaseEnabled } = useAuth();
  const { profile, loading, error } = useData();
  const loc = useLocation();
  useAppearance();

  if (authLoading || loading) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }
  // the whole link, query included (a shared #/map?to=214), for onboarding to come back to
  if (!profile.onboarded) return <Navigate to="/welcome" replace state={{ from: loc.pathname + loc.search }} />;

  const school = SCHOOLS[profile.schoolId];
  return (
    <div className="app">
      <a className="skip" href="#main" onClick={skipToMain}>
        Skip to content
      </a>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            {school.short.slice(0, 3)}
          </span>
          <span className="brand-text">
            <strong>School Day</strong>
            <small>{school.short === 'Other' ? 'Tracker' : school.short}</small>
          </span>
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                <span className="nav-icon" aria-hidden>
                  {n.icon}
                </span>
                <span className="nav-label">{n.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot muted">
          {user ? <>Synced · {user.email ?? user.displayName}</> : firebaseEnabled ? <NavLink to="/login">Sign in to sync</NavLink> : 'Saved on this device'}
        </div>
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {error && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}
        <ImportLocalDataBanner />
        <Outlet />
      </main>
    </div>
  );
}
