// The class form against an in-memory account: leaving with unsaved edits, saving over changes
// made elsewhere, deleting, and Cancel with no page of the app to go back to.
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
    saveAssignment: async () => {},
    deleteAssignment: async () => {},
    saveClass: vi.fn(async (c: ClassInfo) => {
      state = { ...state, classes: [...state.classes.filter((x) => x.id !== c.id), { ...c, updatedAt: Date.now() }] };
      emit();
    }),
    deleteClass: vi.fn(async (id: string) => {
      state = { ...state, classes: state.classes.filter((x) => x.id !== id) };
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
    update(id: string, patch: Partial<ClassInfo>) {
      state = { ...state, classes: state.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
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

import ClassEditPage from './ClassEditPage';

const PROFILE: Profile = { schoolId: 'other', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true };
const CHEM: ClassInfo = {
  id: 'chem1',
  name: 'Chemistry',
  teacher: { name: 'Ms. Rivera' },
  room: { label: '214' },
  periods: ['1'],
  term: 'full',
  color: '#2f6fdf',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt: 1,
};

function mount(entries: string[], index = entries.length - 1) {
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <p>WELCOME PAGE</p> },
      { path: '/homework', element: <p>HOMEWORK PAGE</p> },
      { path: '/classes', element: <p>CLASSES PAGE</p> },
      { path: '/classes/new', element: <ClassEditPage /> },
      { path: '/classes/:id', element: <p>CLASS DETAIL PAGE</p> },
      { path: '/classes/:id/edit', element: <ClassEditPage /> },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const saved = () => fake.api.saveClass.mock.calls.at(-1)?.[0] as ClassInfo;
/** the title of the open dialog, if any */
const openDialog = () => document.querySelector('dialog[open] h2')?.textContent ?? null;
const inDialog = (name: string) => within(document.querySelector<HTMLElement>('dialog[open]')!).getByRole('button', { name });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })));

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
  fake.reset({ profile: PROFILE, classes: [CHEM], assignments: [] });
  fake.api.saveClass.mockClear();
  fake.api.deleteClass.mockClear();
  window.history.replaceState(null, '');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  window.history.replaceState(null, '');
});

describe('ClassEditPage: unsaved changes', () => {
  it('asks before a tab or Back leaves an edited class, and stays on "Keep editing"', async () => {
    const router = mount(['/classes/chem1', '/classes/chem1/edit']);
    type('Office hours / extra help', 'Tue after school');

    await act(() => router.navigate('/homework'));
    expect(router.state.location.pathname).toBe('/classes/chem1/edit');
    expect(openDialog()).toBe('Discard changes?');
    await act(async () => fireEvent.click(inDialog('Keep editing')));
    expect(openDialog()).toBeNull();
    expect(screen.getByLabelText('Office hours / extra help')).toHaveValue('Tue after school');

    // Back (or swipe-back)
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/classes/chem1/edit');
    expect(openDialog()).toBe('Discard changes?');
    await act(async () => fireEvent.click(inDialog('Discard')));
    expect(router.state.location.pathname).toBe('/classes/chem1');
    expect(fake.api.saveClass).not.toHaveBeenCalled();
  });

  it('leaves without asking after saving', async () => {
    const router = mount(['/classes/chem1', '/classes/chem1/edit']);
    type('Office hours / extra help', 'Tue after school');
    await click('Save');
    expect(saved().teacher.officeHours).toBe('Tue after school');
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/classes/chem1');
  });

  it('leaves without asking after deleting the class', async () => {
    const router = mount(['/classes', '/classes/chem1/edit']);
    type('Office hours / extra help', 'Tue after school');
    await click('Delete');
    expect(openDialog()).toBe('Delete Chemistry?');
    await act(async () => fireEvent.click(inDialog('Delete class')));
    expect(fake.api.deleteClass).toHaveBeenCalledWith('chem1');
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/classes');
  });

  it('"Discard" after Cancel leaves without asking a second time', async () => {
    const router = mount(['/classes/chem1', '/classes/chem1/edit']);
    type('Office hours / extra help', 'Tue after school');
    await click('Cancel');
    expect(openDialog()).toBe('Discard changes?');
    await act(async () => fireEvent.click(inDialog('Discard')));
    expect(openDialog()).toBeNull();
    expect(router.state.location.pathname).toBe('/classes/chem1');
  });
});

describe('ClassEditPage: saving', () => {
  it('does not undo what another device changed while the form was open', async () => {
    mount(['/classes/chem1', '/classes/chem1/edit']);
    // archived and given a course code on the phone...
    act(() => fake.update('chem1', { archived: true, courseCode: '0532', teacher: { name: 'Ms. Rivera', email: 'rivera@wwprsd.org' } }));
    // ...then office hours added on the laptop
    type('Office hours / extra help', 'Tue after school');
    await click('Save');
    expect(saved()).toMatchObject({ archived: true, courseCode: '0532', teacher: { name: 'Ms. Rivera', email: 'rivera@wwprsd.org', officeHours: 'Tue after school' } });
  });
});

describe('ClassEditPage: Cancel on a new class', () => {
  it('goes to the class list when there is no earlier page of the app (after onboarding)', async () => {
    const router = mount(['/welcome']);
    await act(() => router.navigate('/classes/new', { replace: true, state: { welcome: true } }));
    await click('Cancel');
    expect(router.state.location.pathname).toBe('/classes');
  });

  it('goes back when the app has an earlier page', async () => {
    const router = mount(['/homework', '/classes/new']);
    window.history.replaceState({ idx: 1 }, '');
    await click('Cancel');
    expect(router.state.location.pathname).toBe('/homework');
  });
});
