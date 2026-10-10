// The welcome flow's error paths, against a fake account store and a stubbed useAuth.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../auth/AuthProvider';

const fake = vi.hoisted(() => {
  let profile: Record<string, unknown> | null = null;
  const subs = new Set<(p: unknown) => void>();
  return {
    auth: {} as Partial<AuthState>,
    reset() {
      profile = null;
      subs.clear();
    },
    store: {
      kind: 'firestore' as const,
      subscribeProfile: (cb: (p: unknown) => void) => {
        subs.add(cb);
        cb(profile);
        return () => subs.delete(cb);
      },
      saveProfile: async (p: Record<string, unknown>) => {
        profile = { ...(profile ?? {}), ...p };
        subs.forEach((s) => s(profile));
      },
      subscribeClasses: (cb: (c: unknown[]) => void) => (cb([]), () => {}),
      subscribeAssignments: (cb: (a: unknown[]) => void) => (cb([]), () => {}),
      saveClass: async () => {},
      deleteClass: async () => {},
      saveAssignment: async () => {},
      deleteAssignment: async () => {},
    },
    copy: vi.fn(async (..._a: unknown[]) => {}),
  };
});

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => fake.auth }));
vi.mock('../data/firestoreStore', () => ({ createFirestoreStore: () => fake.store, copyLocalDataToAccount: fake.copy }));

import { DataProvider } from '../data/DataProvider';
import OnboardingPage from './OnboardingPage';

const ANA = { uid: 'u1', email: 'ana@example.com', displayName: 'Ana', photoURL: null };

function mount() {
  return render(
    <DataProvider>
      <MemoryRouter initialEntries={['/welcome']}>
        <Routes>
          <Route path="/welcome" element={<OnboardingPage />} />
          <Route path="/" element={<p>TODAY PAGE</p>} />
          <Route path="/classes/new" element={<p>NEW CLASS PAGE</p>} />
        </Routes>
      </MemoryRouter>
    </DataProvider>,
  );
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  fake.auth = { user: ANA, loading: false, firebaseEnabled: true, redirectError: null, signInWithGoogle: vi.fn(async () => {}) };
  sessionStorage.setItem('sdt:v1:onboarding', JSON.stringify({ step: 3, schoolId: 'hsn', displayName: 'Ana' }));
});
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('OnboardingPage', () => {
  it('shows a failed copy of this device’s data instead of moving on as if it worked', async () => {
    const now = Date.now();
    localStorage.setItem('sdt:v1:local:classes', JSON.stringify([{ id: 'c1', name: 'Chem', teacher: { name: '' }, room: { label: '' }, periods: [], term: 'full', color: '#123456', links: [], customFields: [], createdAt: now, updatedAt: now }]));
    fake.copy.mockRejectedValueOnce(new Error('Couldn’t copy the class “Chem” to your account: the current grade is too long.'));
    mount();
    expect(screen.getByRole('checkbox')).toBeChecked();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Finish' })));
    expect(screen.queryByText('TODAY PAGE')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t copy the class “Chem”');

    // trying again (and this time it works) moves on
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Finish' })));
    expect(fake.copy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('TODAY PAGE')).toBeInTheDocument();
  });

  it('shows a Google sign-in that failed after a redirect on the account step', () => {
    fake.auth = { ...fake.auth, user: null, redirectError: 'This email already has an account that signs in with a password.' };
    mount();
    expect(screen.getByRole('heading', { name: 'Sync across your devices?' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This email already has an account');
    // not on the other steps
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
