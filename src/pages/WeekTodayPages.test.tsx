// Week shows weekend make-up days; Today's next-school-day card doesn't repeat a far-off date.
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, DayOverride, ISODate, Profile, SchoolSchedule } from '../types';
import { resolveDay } from '../lib/schedule';

const hsn = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/schools/hsn/schedule.json'), 'utf8')) as SchoolSchedule;
const h = vi.hoisted(() => ({ overrides: {} as Record<string, unknown>, now: new Date() }));
const math: ClassInfo = { id: 'm', name: 'Math', periods: ['1'], teacher: { name: 'T' }, room: { label: '214' }, term: 'full', color: '#123456', links: [], customFields: [], createdAt: 0, updatedAt: 0 };

vi.mock('../data/DataProvider', () => ({
  useData: () => ({ profile: { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: h.overrides, onboarded: true } as Profile, classes: [math], assignments: [] }),
}));
vi.mock('../hooks/useSchedule', async (load) => ({
  ...(await load<typeof import('../hooks/useSchedule')>()),
  useNow: () => h.now,
  useSchedule: () => ({ schedule: hsn, loading: false, error: null, getDay: (d: ISODate) => resolveDay(hsn, d, h.overrides as Record<ISODate, DayOverride>) }),
}));
vi.mock('../components/HomeworkDueCard', () => ({ default: () => null }));

import WeekPage from './WeekPage';
import TodayPage from './TodayPage';

afterEach(() => {
  h.overrides = {};
});

describe('Week page', () => {
  it('shows a Saturday make-up day between Friday and Monday', () => {
    h.now = new Date(2026, 9, 14, 12, 0); // Wed Oct 14, 2026
    h.overrides = { '2026-10-17': { noSchool: false, name: 'Make-up day' } };
    render(
      <MemoryRouter>
        <WeekPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/^Sat/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^Sun/)).toHaveLength(0);
  });

  it('shows Monday to Friday in a normal week', () => {
    h.now = new Date(2026, 9, 14, 12, 0);
    render(
      <MemoryRouter>
        <WeekPage />
      </MemoryRouter>,
    );
    expect(screen.queryAllByText(/^Sat/)).toHaveLength(0);
  });
});

describe('Today page', () => {
  it("doesn't repeat the date of a next school day a week or more away", () => {
    h.now = new Date(2026, 11, 23, 15, 0); // Wed Dec 23, 2026, after the early dismissal; back Mon Jan 4
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );
    const titles = screen.getAllByRole('heading').map((x) => x.textContent ?? '');
    const jan4 = titles.filter((t) => /Jan 4/.test(t));
    expect(jan4.length).toBeGreaterThan(0);
    for (const t of jan4) expect(t.match(/Jan 4/g)).toHaveLength(1);
  });
});
