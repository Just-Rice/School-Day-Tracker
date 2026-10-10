import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, Profile, SchoolSchedule } from '../types';

const schedule = (schoolId: SchoolSchedule['schoolId']): SchoolSchedule => ({
  schoolId,
  schoolYear: '2026-2027',
  cycle: { mode: 'rotation', days: [{ id: 'A', name: 'A Day' }, { id: 'B', name: 'B Day' }] },
  periods: [{ id: '1', name: 'Period 1' }],
  bells: [{ id: 'regular', name: 'Regular day', days: { '*': [{ period: '1', start: '08:00', end: '08:50' }] } }],
  calendar: { firstDay: '2026-09-08', lastDay: '2027-06-18', noSchool: [], specialDays: [] },
  source: { urls: [], verified: true },
});

const h = vi.hoisted(() => ({
  profile: {} as Profile,
  classes: [] as ClassInfo[],
  saveProfile: vi.fn(async (..._a: unknown[]) => {}),
  saveClass: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('../data/DataProvider', () => ({
  useData: () => ({ profile: h.profile, classes: h.classes, saveProfile: h.saveProfile, saveClass: h.saveClass }),
}));
vi.mock('../schools', async (load) => ({ ...(await load<typeof import('../schools')>()), loadSchoolSchedule: async (id: SchoolSchedule['schoolId']) => schedule(id) }));

import SchedulePage from './SchedulePage';

const base: Profile = { schoolId: 'cms', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true };

function renderPage() {
  render(
    <MemoryRouter>
      <SchedulePage />
    </MemoryRouter>,
  );
}

describe('SchedulePage', () => {
  beforeEach(() => {
    h.saveProfile.mockClear();
    h.saveClass.mockClear();
    h.classes = [];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('asks before replacing a custom schedule made for another school', async () => {
    h.profile = { ...base, customSchedule: schedule('hsn') };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
    expect(await screen.findByText('Replace your custom schedule for HSN?')).toBeInTheDocument();
    expect(h.saveProfile).not.toHaveBeenCalled();
    // (jsdom has no showModal, so the dialog's contents count as hidden)
    fireEvent.click(screen.getByRole('button', { name: 'Replace', hidden: true }));
    await waitFor(() => expect(h.saveProfile).toHaveBeenCalledTimes(1));
    expect((h.saveProfile.mock.calls[0][0] as Partial<Profile>).customSchedule?.schoolId).toBe('cms');
  });

  it('copies the schedule right away when there is no other custom schedule', async () => {
    h.profile = { ...base };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
    await waitFor(() => expect(h.saveProfile).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Replace your custom schedule/)).not.toBeInTheDocument();
  });

  it('carries renamed ids over to classes and day changes when saving', async () => {
    const custom = schedule('cms');
    custom.bells.push({ id: 'early', name: 'Early dismissal', days: { '*': [{ period: '1', start: '08:00', end: '08:30' }] } });
    h.profile = { ...base, customSchedule: custom, dayOverrides: { '2026-10-21': { bell: 'early' }, '2026-10-22': { noSchool: true } } };
    const math: ClassInfo = { id: 'm', name: 'Math', periods: ['1'], days: ['A'], teacher: { name: 'T' }, room: { label: '1' }, term: 'full', color: '#123456', links: [], customFields: [], createdAt: 0, updatedAt: 0 };
    const art: ClassInfo = { ...math, id: 'a', name: 'Art', periods: ['2'], days: undefined };
    h.classes = [math, art];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const commit = (label: string, value: string) => {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    };
    commit('ID of Period 1', 'P1');
    commit('ID of A Day', 'DA');
    fireEvent.click(screen.getByRole('button', { name: /^Early dismissal/ }));
    commit('Bell schedule ID', 'half');
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(h.saveClass).toHaveBeenCalledTimes(1));
    expect(h.saveClass.mock.calls[0][0]).toMatchObject({ id: 'm', periods: ['P1'], days: ['DA'] });
    const saved = h.saveProfile.mock.calls[0][0] as Partial<Profile>;
    expect(saved.customSchedule?.periods[0].id).toBe('P1');
    expect(saved.dayOverrides).toEqual({ '2026-10-21': { bell: 'half' }, '2026-10-22': { noSchool: true } });
  });
});
