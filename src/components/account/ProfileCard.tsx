import { useState, type FormEvent } from 'react';
import type { SchoolId } from '../../types';
import { useData } from '../../data/DataProvider';
import { activeCustomSchedule } from '../../hooks/useSchedule';
import { roomMapKey, stampMapSchool } from '../../lib/mapData';
import { SCHOOLS } from '../../schools';
import { Button, Card, Field, Modal } from '../ui';
import SchoolPicker from './SchoolPicker';
import { gradeFor, gradeLabel, gradeOptions } from './grades';

export default function ProfileCard() {
  const { profile, classes, saveProfile, saveClass } = useData();
  const [name, setName] = useState(profile.displayName ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [pendingSchool, setPendingSchool] = useState<SchoolId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== (profile.displayName ?? '');

  const attempt = async (job: () => Promise<unknown>) => {
    setError(null);
    try {
      await job();
      return true;
    } catch (e) {
      setError((e as Error).message || 'Could not save.');
      return false;
    }
  };
  const run = (patch: Parameters<typeof saveProfile>[0]) => attempt(() => saveProfile(patch));

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    if (await run({ displayName: name.trim() || undefined })) {
      setName(name.trim());
      setNameSaved(true);
    }
  };

  const switchSchool = async (id: SchoolId) => {
    setPendingSchool(null);
    // room links saved before rooms kept their map's school count as the current school's: mark
    // them as that before leaving it, so they stay on its map and off the new school's
    const from = profile.schoolId;
    const marked = classes.map((c) => stampMapSchool(c, from)).filter((c, i) => c !== classes[i]);
    if (!(await attempt(() => Promise.all(marked.map((c) => saveClass(c)))))) return;
    await run({ schoolId: id, grade: gradeFor(id, profile.grade) });
  };

  const pickSchool = (id: SchoolId) => {
    if (id === profile.schoolId) return;
    // classes point at rooms on the current school's map, so ask before switching
    if (classes.length || activeCustomSchedule(profile)) setPendingSchool(id);
    else void switchSchool(id);
  };

  const mappedRooms = classes.flatMap((c) => [c.room, ...(c.altRooms ?? []).map((a) => a.room)]).filter((r) => roomMapKey(r, profile.schoolId)).length;
  const custom = activeCustomSchedule(profile);
  const cur = SCHOOLS[profile.schoolId];
  const next = pendingSchool ? SCHOOLS[pendingSchool] : null;

  return (
    <Card title="Profile" className="acct-card">
      <div className="stack acct-sections">
        <form onSubmit={saveName}>
          <div className="acct-inline-form">
            <Field label="Your name">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameSaved(false);
                }}
                autoComplete="given-name"
                maxLength={80}
                placeholder="Your first name"
              />
            </Field>
            <Button type="submit" disabled={!dirty}>
              {nameSaved && !dirty ? 'Saved' : 'Save'}
            </Button>
          </div>
          <p className="field-hint acct-hint">Only shown to you, in the app.</p>
        </form>

        <fieldset className="acct-fieldset">
          <legend className="field-label">School</legend>
          <SchoolPicker name="settings-school" value={profile.schoolId} onChange={pickSchool} compact />
          <p className="field-hint">The bell schedule and map follow your school. Rooms on your classes are linked to your school’s map.</p>
        </fieldset>

        <Field label="Grade">
          <select value={profile.grade ?? ''} onChange={(e) => void run({ grade: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Not set</option>
            {gradeOptions(profile.schoolId).map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <div className="banner banner-error acct-banner" role="alert">
          {error}
        </div>
      )}

      <Modal
        open={!!next}
        onClose={() => setPendingSchool(null)}
        title={next ? `Switch to ${next.id === 'other' ? 'another school' : next.short}?` : 'Switch school?'}
        footer={
          <>
            <Button onClick={() => setPendingSchool(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => pendingSchool && void switchSchool(pendingSchool)}>
              Switch school
            </Button>
          </>
        }
      >
        <ul className="acct-bullets">
          <li>
            Your {classes.length} {classes.length === 1 ? 'class stays' : 'classes stay'}, with their periods and room numbers. Check their periods against{' '}
            {next?.id === 'other' ? 'your new bell schedule' : `${next?.short}’s bell schedule`} afterwards.
          </li>
          {mappedRooms > 0 && (
            <li>
              {mappedRooms} {mappedRooms === 1 ? 'room is' : 'rooms are'} linked to the {cur.short} map, so {mappedRooms === 1 ? 'it' : 'they'} won’t show on{' '}
              {next?.hasMap ? `the ${next.short} map` : 'a map'}. Re-pick the room in each class to fix that.
            </li>
          )}
          {custom && (
            <li>
              Your custom bell schedule was made for {cur.short} and won’t be used at {next?.short ?? 'the new school'} (it’s kept if you switch back).
            </li>
          )}
          {profile.grade !== undefined && pendingSchool && gradeFor(pendingSchool, profile.grade) === undefined && (
            <li>
              Your grade will be cleared ({next?.short} doesn’t have {gradeLabel(profile.grade)}).
            </li>
          )}
        </ul>
      </Modal>
    </Card>
  );
}
