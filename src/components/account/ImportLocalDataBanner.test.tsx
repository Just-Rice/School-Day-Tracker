import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assignment, ClassInfo, Profile } from '../../types';
import { localStore } from '../../data/localStore';
import type { DataStore } from '../../data/store';

const h = vi.hoisted(() => ({
  user: { uid: 'u1', displayName: 'Ana', email: 'ana@example.com', photoURL: null } as { uid: string } | null,
  data: { kind: 'firestore', classes: [] as unknown[], assignments: [] as unknown[], loading: false },
  copy: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../data/DataProvider', () => ({
  useData: () => ({
    store: { kind: h.data.kind } as DataStore,
    profile: { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true } as Profile,
    classes: h.data.classes,
    assignments: h.data.assignments,
    loading: h.data.loading,
  }),
}));
vi.mock('../../data/firestoreStore', () => ({ copyLocalDataToAccount: h.copy }));

import ImportLocalDataBanner from './ImportLocalDataBanner';
import { resetDeviceCopy, useDeviceCopy } from './useDeviceCopy';

const cls = (id: string): ClassInfo => ({
  id,
  name: id,
  teacher: { name: '' },
  room: { label: '' },
  periods: [],
  term: 'full',
  color: '#123456',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt: 1,
});
const hw = (id: string): Assignment => ({
  id,
  classId: null,
  title: id,
  type: 'homework',
  dueDate: '2026-10-10',
  priority: 'medium',
  status: 'todo',
  links: [],
  subtasks: [],
  createdAt: 1,
  updatedAt: 1,
});

async function seedLocal() {
  await localStore.saveClass(cls('c1'));
  await localStore.saveClass(cls('c2'));
  await localStore.saveAssignment(hw('a1'));
}

beforeEach(() => {
  localStorage.clear();
  resetDeviceCopy();
  h.user = { uid: 'u1' };
  h.data = { kind: 'firestore', classes: [], assignments: [], loading: false };
  h.copy.mockClear();
});

describe('ImportLocalDataBanner', () => {
  it('offers to copy local data into an empty account', async () => {
    await seedLocal();
    render(<ImportLocalDataBanner />);
    expect(screen.getByText('2 classes and 1 assignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy to my account' })).toBeInTheDocument();
  });

  it('shows nothing when signed out, when the account has data, or without local data', async () => {
    const { container, rerender } = render(<ImportLocalDataBanner />);
    expect(container).toBeEmptyDOMElement();
    await act(seedLocal);
    h.user = null;
    rerender(<ImportLocalDataBanner />);
    expect(container).toBeEmptyDOMElement();
    h.user = { uid: 'u1' };
    h.data.classes = [cls('x')];
    rerender(<ImportLocalDataBanner />);
    expect(container).toBeEmptyDOMElement();
    h.data = { kind: 'local', classes: [], assignments: [], loading: false };
    rerender(<ImportLocalDataBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('remembers "Not now" for this account', async () => {
    await seedLocal();
    const { container, unmount } = render(<ImportLocalDataBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(render(<ImportLocalDataBanner />).container).toBeEmptyDOMElement();
    // a different account on the same device is still asked
    h.user = { uid: 'u2' };
    render(<ImportLocalDataBanner />);
    expect(screen.getByRole('button', { name: 'Copy to my account' })).toBeInTheDocument();
  });

  it('copies, then offers to remove the local copy', async () => {
    await seedLocal();
    render(<ImportLocalDataBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to my account' }));
    });
    expect(h.copy).toHaveBeenCalledTimes(1);
    const [uid, payload] = h.copy.mock.calls[0] as [string, { classes: ClassInfo[]; assignments: Assignment[] }];
    expect(uid).toBe('u1');
    expect(payload.classes.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(payload.assignments.map((a) => a.id)).toEqual(['a1']);
    expect(screen.getByText(/Copied 2 classes and 1 assignment to your account/)).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
    });
    expect(localStore.hasData()).toBe(false);
    expect(screen.getByText(/All set/)).toBeInTheDocument();
  });

  it('shows a copy failure and lets the student try again', async () => {
    await seedLocal();
    h.copy.mockRejectedValueOnce(new Error('Can’t reach the sync server right now.'));
    render(<ImportLocalDataBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to my account' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the sync server');
    expect(screen.getByRole('button', { name: 'Copy to my account' })).toBeEnabled();
  });

  it('shares progress with Settings but does not pop up for a copy started there', async () => {
    await seedLocal();
    h.data.classes = [cls('x')];
    let copyFromSettings!: () => Promise<boolean>;
    function SettingsRow() {
      const dc = useDeviceCopy();
      copyFromSettings = dc.copy;
      return <p>settings: {dc.phase}</p>;
    }
    const { container } = render(
      <>
        <div data-testid="banner">
          <ImportLocalDataBanner />
        </div>
        <SettingsRow />
      </>,
    );
    await act(async () => {
      await copyFromSettings();
    });
    expect(screen.getByText('settings: copied')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="banner"]')).toBeEmptyDOMElement();
  });
});
