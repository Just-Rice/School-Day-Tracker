import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, Profile, SchoolMapData } from '../types';

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

describe('map.css', () => {
  it("stops the route's flow animation after a few runs (it repaints the whole map)", () => {
    const rule = /\.mp-route-flow\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/animation:\s*mp-flow\b/);
    expect(rule).not.toMatch(/infinite/);
  });
});
