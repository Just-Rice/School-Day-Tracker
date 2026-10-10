import fs from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoom, SchoolId, SchoolMapData } from '../../types';

vi.mock('../../schools', async (load) => ({
  ...(await load<typeof import('../../schools')>()),
  loadSchoolMap: async (id: string): Promise<SchoolMapData> => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../public/schools/${id}/map.json`), 'utf8')),
}));

import RoomPicker from './RoomPicker';

/** the picker as a form uses it; returns every room it reported */
function renderPicker(schoolId: SchoolId, initial: ClassRoom) {
  const changes: ClassRoom[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <RoomPicker
        schoolId={schoolId}
        value={value}
        onChange={(r) => {
          changes.push(r);
          setValue(r);
        }}
      />
    );
  }
  render(<Harness />);
  return changes;
}

const loaded = () => screen.findByText((_, el) => el?.classList.contains('field-hint') === true && !/Loading the map/.test(el.textContent ?? ''));

describe('RoomPicker', () => {
  it('stores the school with a room picked from the list', async () => {
    const changes = renderPicker('hsn', { label: '' });
    await loaded();
    const input = screen.getByRole('combobox', { name: 'Room' });
    fireEvent.change(input, { target: { value: 'A10' } });
    fireEvent.click(screen.getByRole('option', { name: /Room A104/ }));
    expect(changes.at(-1)).toEqual({ label: 'A104', mapKey: 'A104', mapSchool: 'hsn' });
    expect(screen.getByText(/On the map: Room A104/)).toBeInTheDocument();
  });

  it('links a typed room on the map to that school, and drops both for text that is not', async () => {
    const changes = renderPicker('cms', { label: '' });
    await loaded();
    const input = screen.getByRole('combobox', { name: 'Room' });
    fireEvent.change(input, { target: { value: '214' } });
    expect(changes.at(-1)).toEqual({ label: '214', mapKey: '214', mapSchool: 'cms' });
    fireEvent.change(input, { target: { value: '214x' } });
    expect(changes.at(-1)).toEqual({ label: '214x', mapKey: undefined, mapSchool: undefined });
  });

  it('clears the link and its school together', async () => {
    const changes = renderPicker('hsn', { label: '214', mapKey: '214', mapSchool: 'hsn' });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Clear room' }));
    expect(changes.at(-1)).toEqual({ label: '' });
  });

  it("shows a room picked on another school's map as text, not as this map's room", async () => {
    const changes = renderPicker('hsn', { label: '214', mapKey: '214', mapSchool: 'cms' });
    await loaded();
    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveValue('214');
    // HSN has a room 214 too (on the 2nd floor), but it's not this one
    expect(screen.queryByText(/On the map/)).toBeNull();
    expect(screen.getByText(/Linked to a room on the CMS map, not this one\. Pick it from the list to link it to the HSN map\./)).toBeInTheDocument();
    // nothing changes until the student picks a room
    expect(changes).toEqual([]);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Room' }));
    fireEvent.click(await screen.findByRole('option', { name: /Room 214/ }));
    expect(changes.at(-1)).toEqual({ label: '214', mapKey: '214', mapSchool: 'hsn' });
    expect(screen.getByText(/On the map: Room 214 · 2nd floor/)).toBeInTheDocument();
  });

  it('shows links from before rooms kept their school on the current map', async () => {
    renderPicker('cms', { label: '214', mapKey: '214' });
    expect(await screen.findByText(/On the map: Room 214 · 1st floor/)).toBeInTheDocument();
  });

  it('drops a map link when the room is renamed at a school without a map', () => {
    const changes = renderPicker('other', { label: '214', mapKey: '214', mapSchool: 'hsn', where: 'B wing' });
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'C wing' } });
    expect(changes.at(-1)).toEqual({ label: '214', mapKey: '214', mapSchool: 'hsn', where: 'C wing' });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: '215' } });
    expect(changes.at(-1)).toEqual({ label: '215', where: 'C wing' });
  });
});
