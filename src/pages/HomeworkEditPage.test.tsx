// The assignment form against an in-memory account: leaving with unsaved edits, links and steps
// typed but not added, saving over changes made elsewhere, and Cancel with no page to go back to.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assignment, ClassInfo, Profile, SchoolSchedule } from '../types';

const fake = vi.hoisted(() => {
  type State = { profile: Profile; classes: ClassInfo[]; assignments: Assignment[] };
  const subs = new Set<() => void>();
  let state: State;
  let value: Record<string, unknown>;
  const emit = () => {
    value = { ...api, ...state, store: { kind: 'local' }, loading: false, error: null };
    subs.forEach((s) => s());
  };
  const api = {
    saveProfile: async () => {},
    saveClass: async () => {},
    deleteClass: async () => {},
    saveAssignment: vi.fn(async (a: Assignment) => {
      state = { ...state, assignments: [...state.assignments.filter((x) => x.id !== a.id), { ...a, updatedAt: Date.now() }] };
      emit();
    }),
    deleteAssignment: vi.fn(async (id: string) => {
      state = { ...state, assignments: state.assignments.filter((x) => x.id !== id) };
      emit();
    }),
  };
  return {
    api,
    reset(s: State) {
      state = s;
      emit();
    },
    /** a change from another device or tab */
    update(id: string, patch: Partial<Assignment>) {
      state = { ...state, assignments: state.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
      emit();
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    get: () => value,
  };
});

vi.mock('../data/DataProvider', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useData: () => useSyncExternalStore(fake.subscribe, fake.get) };
});

const SCHEDULE: SchoolSchedule = {
  schoolId: 'other',
  schoolYear: '2026-2027',
  cycle: { mode: 'weekday', days: ['mon', 'tue', 'wed', 'thu', 'fri'].map((id) => ({ id, name: id })) },
  periods: [{ id: '1', name: 'Period 1' }],
  bells: [{ id: 'regular', name: 'Regular day', days: { '*': [{ period: '1', start: '08:00', end: '08:50' }] } }],
  calendar: { firstDay: '2026-09-01', lastDay: '2027-06-18', noSchool: [], specialDays: [] },
};
vi.mock('../schools', async (load) => ({ ...(await load<typeof import('../schools')>()), loadSchoolSchedule: async () => SCHEDULE }));

import HomeworkEditPage from './HomeworkEditPage';

const PROFILE: Profile = { schoolId: 'other', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true };
const HW: Assignment = {
  id: 'hw1',
  classId: null,
  title: 'Lab report',
  type: 'lab',
  dueDate: '2026-10-20',
  priority: 'medium',
  status: 'todo',
  links: [],
  subtasks: [],
  createdAt: 1,
  updatedAt: 1,
};

function mount(entries: string[], index = entries.length - 1) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>TODAY PAGE</p> },
      { path: '/welcome', element: <p>WELCOME PAGE</p> },
      { path: '/homework', element: <p>HOMEWORK LIST</p> },
      { path: '/homework/new', element: <HomeworkEditPage /> },
      { path: '/homework/:id', element: <HomeworkEditPage /> },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const saved = () => fake.api.saveAssignment.mock.calls.at(-1)?.[0] as Assignment;
/** the title of the open dialog, if any */
const openDialog = () => document.querySelector('dialog[open] h2')?.textContent ?? null;
const inDialog = (name: string) => within(document.querySelector<HTMLElement>('dialog[open]')!).getByRole('button', { name });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
// the page has a Save button at the top and at the bottom
const clickSave = () => act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]));

beforeAll(() => {
  // jsdom has no showModal/close
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  fake.reset({ profile: PROFILE, classes: [], assignments: [HW] });
  fake.api.saveAssignment.mockClear();
  window.history.replaceState(null, '');
});
afterEach(() => {
  window.history.replaceState(null, '');
});

describe('HomeworkEditPage: unsaved changes', () => {
  it('asks before a tab or Back leaves an edited assignment, and stays on "Keep editing"', async () => {
    const router = mount(['/homework', '/homework/hw1']);
    type('Notes', 'Bring goggles');

    await act(() => router.navigate('/'));
    expect(router.state.location.pathname).toBe('/homework/hw1');
    expect(openDialog()).toBe('Discard changes?');
    await act(async () => fireEvent.click(inDialog('Keep editing')));
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/homework/hw1');
    expect(screen.getByLabelText('Notes')).toHaveValue('Bring goggles');

    // Back (or swipe-back)
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/homework/hw1');
    expect(openDialog()).toBe('Discard changes?');
    await act(async () => fireEvent.click(inDialog('Discard')));
    expect(router.state.location.pathname).toBe('/homework');
    expect(fake.api.saveAssignment).not.toHaveBeenCalled();
  });

  it('asks on Cancel when something changed', async () => {
    const router = mount(['/homework', '/homework/hw1']);
    type('Title *', 'Lab report v2');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(openDialog()).toBe('Discard changes?');
    expect(router.state.location.pathname).toBe('/homework/hw1');
  });

  it('counts a link or step typed but not added as a change', async () => {
    const router = mount(['/homework', '/homework/hw1']);
    type('New step', 'Write conclusion');
    await act(() => router.navigate('/'));
    expect(router.state.location.pathname).toBe('/homework/hw1');
    expect(openDialog()).toBe('Discard changes?');
  });

  it('leaves without asking when nothing changed, after saving and after deleting', async () => {
    const router = mount(['/homework', '/homework/hw1']);
    await act(() => router.navigate('/'));
    expect(router.state.location.pathname).toBe('/');

    await act(() => router.navigate('/homework/hw1'));
    type('Notes', 'Bring goggles');
    await clickSave();
    expect(saved().notes).toBe('Bring goggles');
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/homework');

    await act(() => router.navigate('/homework/hw1'));
    type('Notes', 'changed again');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(inDialog('Delete')));
    expect(fake.api.deleteAssignment).toHaveBeenCalledWith('hw1');
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/homework');
  });
});

describe('HomeworkEditPage: saving', () => {
  it('keeps a link and a step that were typed but not added', async () => {
    mount(['/homework', '/homework/hw1']);
    type('New link address', 'docs.google.com/document/d/abc');
    type('New step', 'Write conclusion');
    await clickSave();
    expect(saved().links).toEqual([{ label: 'docs.google.com/document/d/abc', url: 'https://docs.google.com/document/d/abc' }]);
    expect(saved().subtasks.map((s) => s.text)).toEqual(['Write conclusion']);
  });

  it('does not undo what another device changed while the form was open', async () => {
    mount(['/homework', '/homework/hw1']);
    // checked off on the phone...
    act(() => fake.update('hw1', { status: 'done', completedAt: 123, priority: 'high' }));
    // ...then a note added on the laptop
    type('Notes', 'Bring goggles');
    await clickSave();
    expect(saved()).toMatchObject({ status: 'done', completedAt: 123, priority: 'high', notes: 'Bring goggles', title: 'Lab report' });
  });

  it("still saves the user's own change to a field that also changed elsewhere", async () => {
    mount(['/homework', '/homework/hw1']);
    act(() => fake.update('hw1', { title: 'Lab report (phone)' }));
    type('Title *', 'Lab report (laptop)');
    await clickSave();
    expect(saved().title).toBe('Lab report (laptop)');
  });
});

describe('HomeworkEditPage: Cancel', () => {
  it('goes to the homework list when there is no earlier page of the app to go back to', async () => {
    // e.g. after onboarding, which replaces its own entry
    const router = mount(['/welcome']);
    await act(() => router.navigate('/homework/new', { replace: true }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(router.state.location.pathname).toBe('/homework');
  });

  it('goes back when the app has an earlier page', async () => {
    const router = mount(['/homework?view=done', '/homework/new']);
    window.history.replaceState({ idx: 1 }, '');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(router.state.location.pathname).toBe('/homework');
    expect(router.state.location.search).toBe('?view=done');
  });
});
