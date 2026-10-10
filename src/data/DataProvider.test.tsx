// DataProvider against a fake account store: what happens when Firestore refuses to load or save.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo } from '../types';
import type { ErrorSource } from './store';

type Kind = 'profile' | 'classes' | 'assignments';
interface Sub {
  kind: Kind;
  cb: (v: unknown) => void;
  onError?: (e: Error, source: ErrorSource) => void;
  live: boolean;
}

const fake = vi.hoisted(() => {
  const subs: Sub[] = [];
  const subscribe = (kind: Kind) => (cb: (v: unknown) => void, onError?: (e: Error, source: ErrorSource) => void) => {
    const s: Sub = { kind, cb, onError, live: true };
    subs.push(s);
    return () => (s.live = false);
  };
  const store = {
    kind: 'firestore' as const,
    subscribeProfile: subscribe('profile'),
    subscribeClasses: subscribe('classes'),
    subscribeAssignments: subscribe('assignments'),
    saveProfile: vi.fn(async (..._a: unknown[]) => {}),
    saveClass: vi.fn(async (..._a: unknown[]) => {}),
    deleteClass: vi.fn(async (..._a: unknown[]) => {}),
    saveAssignment: vi.fn(async (..._a: unknown[]) => {}),
    deleteAssignment: vi.fn(async (..._a: unknown[]) => {}),
  };
  return {
    subs,
    store,
    signOut: vi.fn(async () => {}),
    /** the live subscription of a kind */
    live: (kind: Kind) => subs.filter((s) => s.kind === kind && s.live).at(-1)!,
  };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'ana@example.com', displayName: 'Ana', photoURL: null }, loading: false, firebaseEnabled: true, signOut: fake.signOut }),
}));
vi.mock('./firestoreStore', () => ({ createFirestoreStore: () => fake.store }));

import { DataProvider, useData, type DataState } from './DataProvider';

const DENIED = 'Your account doesn’t have access to this data. Try signing out and back in.';
const QUOTA = 'The sync service is busy (quota reached). Try again later.';

let data!: DataState;
function App() {
  data = useData();
  return <p>{data.loading ? 'Loading…' : `APP ${data.classes.length} classes${data.error ? ' · ' + data.error : ''}`}</p>;
}

function mount() {
  return render(
    <DataProvider>
      <App />
    </DataProvider>,
  );
}

function deliverAll(classes: unknown[] = []) {
  act(() => {
    fake.live('profile').cb({ schoolId: 'hsn', onboarded: true });
    fake.live('classes').cb(classes);
    fake.live('assignments').cb([]);
  });
}

const cls = { id: 'c1', name: 'Chem', teacher: { name: '' }, room: { label: '' }, periods: [], term: 'full', color: '#123456', links: [], customFields: [], createdAt: 1, updatedAt: 1 } as ClassInfo;

beforeEach(() => {
  fake.subs.length = 0;
  vi.clearAllMocks();
});

describe('DataProvider', () => {
  it('shows the error and a way out when the account can’t be loaded at all, instead of loading forever', async () => {
    mount();
    act(() => {
      fake.live('classes').cb([]);
      fake.live('assignments').cb([]);
      fake.live('profile').onError!(new Error(DENIED), 'listen');
    });
    expect(screen.getByRole('heading', { name: 'Couldn’t load your data' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(DENIED);
    expect(screen.queryByText('Loading…')).toBeNull();

    // Try again subscribes again; once everything arrives, the app is back
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('heading', { name: 'Couldn’t load your data' })).toBeNull();
    deliverAll([cls]);
    expect(screen.getByText('APP 1 classes')).toBeInTheDocument();
  });

  it('can sign out from there to use this device’s data', async () => {
    mount();
    act(() => fake.live('profile').onError!(new Error(QUOTA), 'listen'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(fake.signOut).toHaveBeenCalledTimes(1);
  });

  it('subscribes again after a listener fails later, when the app comes back to the foreground', () => {
    mount();
    deliverAll([cls]);
    act(() => fake.live('classes').onError!(new Error(QUOTA), 'listen'));
    // the data on screen stays, with the error
    expect(screen.getByText(`APP 1 classes · ${QUOTA}`)).toBeInTheDocument();
    const before = fake.subs.length;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fake.subs.length).toBe(before + 3);
    deliverAll([cls, { ...cls, id: 'c2' }]);
    expect(screen.getByText('APP 2 classes')).toBeInTheDocument();
    // and stops listening for that once it works again
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fake.subs.length).toBe(before + 3);
  });

  it('clears a save error once a later save works', async () => {
    mount();
    deliverAll();
    fake.store.saveClass.mockRejectedValueOnce(new Error('This can’t be synced to your account: the current grade is too long.'));
    await act(async () => {
      await expect(data.saveClass(cls)).rejects.toThrow(/too long/);
    });
    expect(data.error).toMatch(/current grade is too long/);
    await act(async () => {
      await data.saveClass(cls);
    });
    expect(data.error).toBeNull();
  });

  it('shows a late save failure without treating the data as unavailable', async () => {
    mount();
    deliverAll([cls]);
    act(() => fake.live('profile').onError!(new Error('Your account didn’t accept this change.'), 'save'));
    expect(screen.getByText('APP 1 classes · Your account didn’t accept this change.')).toBeInTheDocument();
    const before = fake.subs.length;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // nothing to subscribe again for
    expect(fake.subs.length).toBe(before);
  });
});
