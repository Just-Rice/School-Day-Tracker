// CONTRACT (other features import this; keep the signatures):
//   useSchedule() -> ScheduleState for the signed-in user's school (or their custom schedule),
//   with their day overrides applied.
//   useNow(intervalMs) -> a Date that re-renders the component every intervalMs.
//   classesOnDay(day, classes) -> the class meetings of a DayInfo, in time order.
// The engine itself lives in src/lib/schedule.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayInfo, DayOverride, ISODate, Profile, SchoolId, SchoolSchedule } from '../types';
import { useData } from '../data/DataProvider';
import { loadSchoolSchedule } from '../schools';
import { normalizeSchedule, resolveDay } from '../lib/schedule';

export { classesOnDay, type Meeting } from '../lib/schedule';

export interface ScheduleState {
  /** the schedule in effect: profile.customSchedule ?? the school's schedule.json */
  schedule: SchoolSchedule | null;
  loading: boolean;
  error: string | null;
  /** resolved day for a date (cycle day, bell, slots), with the user's overrides */
  getDay(date: ISODate): DayInfo;
}

export interface SchoolScheduleFile {
  schedule: SchoolSchedule | null;
  loading: boolean;
  error: string | null;
}

function loadErrorMessage(e: Error): string {
  // a missing file comes back as the app's index.html, which fails to parse as JSON
  if (e instanceof SyntaxError) return "This school's bell schedule isn't available yet.";
  return e.message || 'Could not load the bell schedule.';
}

/** The school's published public/schools/<id>/schedule.json (ignores any custom schedule). */
export function useSchoolScheduleFile(schoolId: SchoolId, enabled = true): SchoolScheduleFile {
  const [loaded, setLoaded] = useState<{ id: SchoolId; schedule: SchoolSchedule | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadSchoolSchedule(schoolId)
      .then((schedule) => live && setLoaded({ id: schoolId, schedule, error: null }))
      .catch((e: Error) => live && setLoaded({ id: schoolId, schedule: null, error: loadErrorMessage(e) }));
    return () => {
      live = false;
    };
  }, [schoolId, enabled]);
  if (!enabled) return { schedule: null, loading: false, error: null };
  if (loaded?.id !== schoolId) return { schedule: null, loading: true, error: null };
  return { schedule: loaded.schedule, loading: false, error: loaded.error };
}

/**
 * Returns `value` itself until its JSON changes. Profile snapshots arrive as fresh objects on
 * every save, and resolveDay memoizes per object, so this keeps those caches warm.
 */
function useStable<T>(value: T): T {
  const key = useMemo(() => JSON.stringify(value ?? null), [value]);
  // keyed by content on purpose: `value` is deliberately not a dependency
  return useMemo(() => value, [key]);
}

/** the user's custom schedule, unless it was made for a different school than the profile's */
export function activeCustomSchedule(p: Pick<Profile, 'customSchedule' | 'schoolId'>): SchoolSchedule | undefined {
  const c = p.customSchedule;
  return c && (!c.schoolId || c.schoolId === p.schoolId) ? c : undefined;
}

export function useSchedule(): ScheduleState {
  const { profile } = useData();
  const custom = useStable<SchoolSchedule | undefined>(activeCustomSchedule(profile));
  const overrides = useStable<Record<ISODate, DayOverride>>(profile.dayOverrides ?? {});
  const file = useSchoolScheduleFile(profile.schoolId, !custom);

  const source = custom ?? file.schedule;
  const schedule = useMemo(() => (source ? normalizeSchedule(source) : null), [source]);
  const loading = !custom && file.loading;
  const error = custom ? null : file.error;

  const getDay = useCallback(
    (date: ISODate): DayInfo => {
      if (schedule) return resolveDay(schedule, date, overrides);
      return { date, isSchoolDay: false, reason: loading ? 'Loading schedule…' : 'No bell schedule', slots: [], notes: [] };
    },
    [schedule, overrides, loading],
  );

  return useMemo(() => ({ schedule, loading, error, getDay }), [schedule, loading, error, getDay]);
}

export function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    // catch up immediately when a phone wakes the tab
    const wake = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [intervalMs]);
  return now;
}
