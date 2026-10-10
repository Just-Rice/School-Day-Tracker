// The app shell under a real hash router: the skip link and the redirect to onboarding.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createHashRouter, createMemoryRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../types';

const h = vi.hoisted(() => ({ profile: {} as Profile }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false, firebaseEnabled: false }) }));
vi.mock('../data/DataProvider', () => ({ useData: () => ({ profile: h.profile, loading: false, error: null }) }));
vi.mock('./account/ImportLocalDataBanner', () => ({ default: () => null }));

import Layout from './Layout';

const PROFILE: Profile = { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true };
const routes: RouteObject[] = [
  { path: '/welcome', element: <p>WELCOME PAGE</p> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <h1>Today</h1> },
      { path: 'homework', element: <h1>Homework</h1> },
      { path: 'map', element: <h1>Map</h1> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

afterEach(() => {
  window.location.hash = '';
});

describe('Layout', () => {
  it('"Skip to content" moves focus to the page without changing the route', async () => {
    h.profile = PROFILE;
    window.location.hash = '#/homework?view=done';
    const router = createHashRouter(routes);
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('heading', { name: 'Homework' })).toBeInTheDocument();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    skip.focus();
    await act(async () => {
      fireEvent.click(skip);
      // let a hash change, if any, reach the router
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(window.location.hash).toBe('#/homework?view=done');
    expect(router.state.location.pathname).toBe('/homework');
    expect(screen.getByRole('heading', { name: 'Homework' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.getElementById('main'));
    router.dispose();
  });

  it('sends a new student to onboarding with the whole link they opened, query included', () => {
    h.profile = { ...PROFILE, onboarded: false };
    const router = createMemoryRouter(routes, { initialEntries: ['/map?from=entrance&to=214'] });
    render(<RouterProvider router={router} />);
    expect(router.state.location.pathname).toBe('/welcome');
    expect(router.state.location.state).toEqual({ from: '/map?from=entrance&to=214' });
  });
});
