import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInfo, ClassRoom, Profile } from '../../types';

const h = vi.hoisted(() => {
  /** the saves, in order */
  const calls: string[] = [];
  return {
    profile: { schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true } as Profile,
    classes: [] as ClassInfo[],
    calls,
    saveClass: vi.fn(async (c: ClassInfo) => void calls.push(`class ${c.id}`)),
    saveProfile: vi.fn(async (p: Partial<Profile>) => void calls.push(`profile ${p.schoolId}`)),
  };
});

vi.mock('../../data/DataProvider', () => ({ useData: () => ({ profile: h.profile, classes: h.classes, saveClass: h.saveClass, saveProfile: h.saveProfile }) }));

import ProfileCard from './ProfileCard';

const cls = (id: string, room: ClassRoom, altRooms?: ClassInfo['altRooms']): ClassInfo => ({
  id,
  name: id,
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

const { saveClass, saveProfile } = h;

beforeEach(() => {
  h.calls.length = 0;
  saveClass.mockClear();
  saveProfile.mockClear();
  h.classes = [
    // picked before rooms kept their school: HSN's
    cls('older', { label: '214', mapKey: '214' }, [{ days: ['A'], room: { label: 'Gym', mapKey: 'Gym' } }]),
    cls('cms', { label: '214', mapKey: '214', mapSchool: 'cms' }),
    cls('cms gym', { label: 'Gym', mapKey: 'Gym', mapSchool: 'cms' }),
    cls('hsn', { label: 'A104', mapKey: 'A104', mapSchool: 'hsn' }),
    cls('text', { label: 'Portable 3' }),
  ];
});

const dialog = () => within(document.querySelector<HTMLElement>('dialog[open]')!);

describe('ProfileCard: switching school', () => {
  it("says how many rooms are on the current school's map", () => {
    render(<ProfileCard />);
    fireEvent.click(screen.getByRole('radio', { name: /Community Middle School/ }));
    // the classes picked at CMS aren't on the HSN map now, so they aren't counted
    expect(dialog().getByText(/3 rooms are linked to the HSN map, so they won’t show on the CMS map\./)).toBeInTheDocument();
  });

  it('marks older room links as the old school’s before switching, so they stay off the new map', async () => {
    render(<ProfileCard />);
    fireEvent.click(screen.getByRole('radio', { name: /Community Middle School/ }));
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Switch school' })));
    expect(h.calls).toEqual(['class older', 'profile cms']);
    expect(saveClass.mock.calls[0][0]).toMatchObject({
      id: 'older',
      room: { label: '214', mapKey: '214', mapSchool: 'hsn' },
      altRooms: [{ days: ['A'], room: { label: 'Gym', mapKey: 'Gym', mapSchool: 'hsn' } }],
    });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 'cms' }));
  });

  it("doesn't switch when the room links can't be saved", async () => {
    saveClass.mockRejectedValueOnce(new Error('Could not reach the server.'));
    render(<ProfileCard />);
    fireEvent.click(screen.getByRole('radio', { name: /Community Middle School/ }));
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Switch school' })));
    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
  });
});
