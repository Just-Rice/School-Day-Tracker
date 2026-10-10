import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, ClassRoom, Profile } from '../types';

const h = vi.hoisted(() => ({
  profile: { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true } as Profile,
  classes: [] as ClassInfo[],
  deleteClass: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('../data/DataProvider', () => ({ useData: () => ({ profile: h.profile, classes: h.classes, assignments: [], loading: false, saveClass: async () => {}, deleteClass: h.deleteClass }) }));
vi.mock('../schools', async (load) => {
  const file = (id: string, name: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../public/schools/${id}/${name}`), 'utf8'));
  return { ...(await load<typeof import('../schools')>()), loadSchoolMap: async (id: string) => file(id, 'map.json'), loadSchoolSchedule: async (id: string) => file(id, 'schedule.json') };
});

import ClassDetailPage from './ClassDetailPage';

const cls = (room: ClassRoom, altRooms?: ClassInfo['altRooms']): ClassInfo => ({
  id: 'c1',
  name: 'Algebra II',
  teacher: { name: '' },
  room,
  altRooms,
  periods: ['1'],
  term: 'full',
  color: '#2f6fdf',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt: 1,
});

const page = () => (
  <MemoryRouter initialEntries={['/classes/c1']}>
    <Routes>
      <Route path="/classes/:id" element={<ClassDetailPage />} />
    </Routes>
  </MemoryRouter>
);

function renderClass(c: ClassInfo) {
  h.classes = [c];
  return render(page());
}

const hsnProfile = h.profile;
afterEach(() => {
  h.profile = hsnProfile;
});

describe('ClassDetailPage: the room on the map', () => {
  it("links a room picked on the school's map", async () => {
    renderClass(cls({ label: '214', mapKey: '214', mapSchool: 'hsn' }));
    expect(await screen.findByText(/2nd floor/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Show on map/ })).toHaveAttribute('href', '/map?to=214');
  });

  it("doesn't show or route to this school's room with the same number for one picked at another school", async () => {
    renderClass(cls({ label: '214', mapKey: '214', mapSchool: 'cms' }, [{ days: ['A'], room: { label: 'Gym', mapKey: 'Gym', mapSchool: 'cms' } }]));
    const notes = await screen.findAllByText('Linked to a room on the CMS map, not the HSN one. Edit the class to pick it again.');
    expect(notes).toHaveLength(2);
    // not HSN's Room 214 on the 2nd floor, not even by its label
    expect(screen.queryByText(/2nd floor|1st floor/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Show on map|Directions/ })).toBeNull();
  });

  it("doesn't route the teacher's office to this school's room with that number either", async () => {
    // an HSN class (room picked on the HSN map) viewed at CMS, with the office typed as '214'
    h.profile = { ...hsnProfile, schoolId: 'cms' };
    renderClass({ ...cls({ label: 'A104', mapKey: 'A104', mapSchool: 'hsn' }), teacher: { name: 'Ms. Lee', office: '214' } });
    expect(await screen.findByText(/Linked to a room on the HSN map/)).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
  });

  it("routes the teacher's office on the school's own map", async () => {
    h.profile = { ...hsnProfile, schoolId: 'cms' };
    renderClass({ ...cls({ label: '108', mapKey: '108', mapSchool: 'cms' }), teacher: { name: 'Ms. Lee', office: '214' } });
    expect(await screen.findByText(/1st floor/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Directions/ }).map((l) => l.getAttribute('href'))).toContain('/map?from=entrance&to=214');
  });

  it('shows it again at the school it was picked at', async () => {
    h.profile = { ...hsnProfile, schoolId: 'cms' };
    renderClass(cls({ label: '214', mapKey: '214', mapSchool: 'cms' }));
    expect(await screen.findByText(/1st floor/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?from=entrance&to=214');
  });
});

describe('ClassDetailPage: deleting', () => {
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

  it('follows the class again after a delete that failed', async () => {
    h.deleteClass.mockRejectedValueOnce(new Error('Could not reach the server.'));
    const { rerender } = renderClass(cls({ label: '214', mapKey: '214', mapSchool: 'hsn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = () => within(document.querySelector<HTMLElement>('dialog[open]')!);
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete class' })));
    expect(dialog().getByRole('alert')).toHaveTextContent('Could not reach the server.');
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    // the class stays; deleted later on another device, the page says so instead of showing the old copy
    h.classes = [];
    rerender(page());
    expect(screen.getByRole('heading', { name: 'Class not found' })).toBeInTheDocument();
  });
});
