import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, ClassRoom, Profile, SchoolMapData } from '../types';

const h = vi.hoisted(() => ({
  profile: { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true } as Profile,
  classes: [] as ClassInfo[],
}));

vi.mock('../data/DataProvider', () => ({ useData: () => ({ profile: h.profile, classes: h.classes }) }));
vi.mock('../schools', async (load) => ({
  ...(await load<typeof import('../schools')>()),
  loadSchoolMap: async (id: string): Promise<SchoolMapData> => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../public/schools/${id}/map.json`), 'utf8')),
}));

import MapPage from './MapPage';

const css = fs.readFileSync(path.resolve(__dirname, 'map.css'), 'utf8');

/** map.css as a phone sees it (jsdom only applies @media rules for 'screen') */
function phoneStyles() {
  const style = document.createElement('style');
  style.textContent = css.replace('@media (max-width: 900px)', '@media screen');
  document.head.append(style);
  return () => style.remove();
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <MapPage />
    </MemoryRouter>,
  );
}

describe('MapPage on a phone', () => {
  let unstyle: () => void;
  beforeEach(() => {
    unstyle = phoneStyles();
  });
  afterEach(() => unstyle());

  it('shows the "Start from room" search when picking another room to start from', async () => {
    const { container } = renderAt('/map?to=A104');
    const from = await screen.findByLabelText('From');
    const panel = container.querySelector('.mp-panel')!;
    // with a room picked, the sheet peeks and the room takes the main search box's place
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('combobox', { name: 'Search rooms', hidden: true })).not.toBeVisible();

    fireEvent.change(from, { target: { value: '__other' } });
    const start = screen.getByRole('combobox', { name: 'Start from room' });
    expect(start).toBeVisible();
    expect(start).toHaveFocus();
    // the sheet comes up for the search results
    expect(panel).toHaveAttribute('data-open', 'true');

    // and the search stays when the sheet goes back down
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(start).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Search rooms', hidden: true })).not.toBeVisible();
  });
});

describe('MapPage: my classes', () => {
  const mk = (id: string, name: string, room: ClassRoom, altRooms?: ClassInfo['altRooms']): ClassInfo => ({
    id,
    name,
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
  const hsnProfile = h.profile;
  beforeEach(() => {
    // 214, 301 and Gym are on both schools' maps, as different rooms
    h.classes = [
      mk('a', 'Chemistry', { label: 'A104', mapKey: 'A104', mapSchool: 'hsn' }),
      mk('b', 'Biology', { label: '214', mapKey: '214' }),
      mk('c', 'Band', { label: '214', mapKey: '214', mapSchool: 'cms' }),
      mk('d', 'PE', { label: 'Gym', mapKey: 'Gym', mapSchool: 'cms' }, [{ days: ['A'], room: { label: '301', mapKey: '301', mapSchool: 'cms' } }]),
    ];
  });
  afterEach(() => {
    h.classes = [];
    h.profile = hsnProfile;
  });

  const listed = async (container: HTMLElement) => {
    await screen.findByRole('heading', { name: 'My classes' });
    return [...container.querySelectorAll('.mp-quick li')].map((li) => `${li.querySelector('.mp-quick-name')!.textContent} @ ${li.querySelector('.muted')!.textContent}`);
  };

  it("shows only classes whose rooms were picked on this school's map", async () => {
    const { container } = renderAt('/map');
    // Biology's link is from before rooms kept their school, so it counts as the current one's
    expect(await listed(container)).toEqual(['Chemistry @ Room A104 · 1st floor', 'Biology @ Room 214 · 2nd floor']);
    expect(screen.queryByText(/\bBand\b|\bPE\b/)).toBeNull();
  });

  it("offers only this school's class rooms to start from", async () => {
    renderAt('/map?to=A104');
    const from = await screen.findByLabelText('From');
    const options = [...from.querySelectorAll('optgroup[label="My classes"] option')].map((o) => o.textContent);
    expect(options).toEqual(['Biology (Room 214)']);
  });

  it('shows the classes picked at CMS on the CMS map', async () => {
    h.profile = { ...hsnProfile, schoolId: 'cms' };
    const { container } = renderAt('/map');
    const rows = await listed(container);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^Biology \/ Band @ Room 214 · 1st floor/);
    expect(rows.slice(1).map((r) => r.split(' @ ')[0])).toEqual(['PE', 'PE']);
    expect(screen.queryByText(/Chemistry/)).toBeNull();
  });
});

describe('map.css', () => {
  it("stops the route's flow animation after a few runs (it repaints the whole map)", () => {
    const rule = /\.mp-route-flow\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/animation:\s*mp-flow\b/);
    expect(rule).not.toMatch(/infinite/);
  });
});
