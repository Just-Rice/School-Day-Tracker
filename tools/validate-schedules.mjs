#!/usr/bin/env node
// Checks public/schools/*/schedule.json against the SchoolSchedule shape in src/types.ts and the
// rules the schedule engine relies on (valid dates and times, sorted non-overlapping slots, ids
// that point at something). Run it after editing a schedule:
//
//   node tools/validate-schedules.mjs              check every school
//   node tools/validate-schedules.mjs path.json    check specific files
//   node tools/validate-schedules.mjs --self-test  run the validator's own tests
//
// Exits 1 when any file has errors. Warnings are printed but don't fail the run.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHOOL_IDS = ['hsn', 'cms', 'other'];
const SLOT_KINDS = ['class', 'lunch', 'homeroom', 'break', 'other'];
const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** a school year is ~290 days; anything much longer is a typo like lastDay 2207-06-18 */
const MAX_YEAR_SPAN_DAYS = 400;
const DAY_MS = 86400000;

const KNOWN_KEYS = {
  schedule: ['schoolId', 'schoolYear', 'cycle', 'periods', 'bells', 'calendar', 'source'],
  cycle: ['mode', 'days'],
  cycleDay: ['id', 'name'],
  period: ['id', 'name', 'kind'],
  bell: ['id', 'name', 'days'],
  slot: ['period', 'label', 'start', 'end', 'kind'],
  calendar: ['firstDay', 'lastDay', 'anchor', 'noSchool', 'specialDays'],
  anchor: ['date', 'cycleDay'],
  noSchool: ['date', 'end', 'name'],
  specialDay: ['date', 'name', 'bell', 'cycleDay', 'advance'],
  source: ['urls', 'note', 'verified', 'retrieved'],
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** 'YYYY-MM-DD' -> UTC ms, or null when it isn't a real calendar date */
export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null;
}

/** 'HH:MM' (24-hour) -> minutes after midnight, or null */
export function parseTime(s) {
  if (typeof s !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
}

const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
const weekdayOf = (t) => new Date(t).getUTCDay();

/**
 * Validates one parsed schedule.json.
 * @param {unknown} s the parsed JSON
 * @param {{ expectId?: string }} [opts] expectId: the school folder name the file lives in
 * @returns {{ errors: string[], warnings: string[], summary?: string }}
 */
export function validateSchedule(s, opts = {}) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);
  const unknownKeys = (obj, kind, where) => {
    for (const k of Object.keys(obj)) if (!KNOWN_KEYS[kind].includes(k)) warn(`${where}: unknown field "${k}" (typo?)`);
  };

  if (!isObj(s)) return { errors: ['the file must contain a JSON object'], warnings };
  unknownKeys(s, 'schedule', 'schedule');

  // --- identity
  if (!SCHOOL_IDS.includes(s.schoolId)) err(`schoolId must be one of ${SCHOOL_IDS.join(', ')} (got ${JSON.stringify(s.schoolId)})`);
  else if (opts.expectId && s.schoolId !== opts.expectId) err(`schoolId "${s.schoolId}" doesn't match its folder "${opts.expectId}"`);
  const year = typeof s.schoolYear === 'string' ? /^(\d{4})-(\d{4})$/.exec(s.schoolYear) : null;
  if (!year || Number(year[2]) !== Number(year[1]) + 1) err(`schoolYear must look like "2026-2027" (got ${JSON.stringify(s.schoolYear)})`);

  // --- cycle
  const cycleIds = new Set();
  let mode;
  if (!isObj(s.cycle)) err('cycle is missing (expected { mode, days })');
  else {
    unknownKeys(s.cycle, 'cycle', 'cycle');
    mode = s.cycle.mode;
    if (mode !== 'rotation' && mode !== 'weekday') err(`cycle.mode must be "rotation" or "weekday" (got ${JSON.stringify(mode)})`);
    if (!Array.isArray(s.cycle.days) || s.cycle.days.length === 0) err('cycle.days must be a non-empty array of { id, name }');
    else
      s.cycle.days.forEach((d, i) => {
        const at = `cycle.days[${i}]`;
        if (!isObj(d)) return err(`${at} must be an object { id, name }`);
        unknownKeys(d, 'cycleDay', at);
        if (!isText(d.id)) return err(`${at}.id must be a non-empty string`);
        if (cycleIds.has(d.id)) err(`${at}: duplicate cycle day id "${d.id}"`);
        cycleIds.add(d.id);
        if (!isText(d.name)) err(`${at} ("${d.id}"): name must be a non-empty string`);
        if (mode === 'weekday' && !WEEKDAY_IDS.includes(d.id)) err(`${at}: weekday mode needs ids ${WEEKDAY_IDS.slice(1, 6).join(', ')} (got "${d.id}")`);
      });
  }

  // --- periods
  const periodIds = new Set();
  if (!Array.isArray(s.periods) || s.periods.length === 0) err('periods must be a non-empty array of { id, name, kind? }');
  else
    s.periods.forEach((p, i) => {
      const at = `periods[${i}]`;
      if (!isObj(p)) return err(`${at} must be an object { id, name }`);
      unknownKeys(p, 'period', at);
      if (!isText(p.id)) return err(`${at}.id must be a non-empty string`);
      if (periodIds.has(p.id)) err(`${at}: duplicate period id "${p.id}"`);
      periodIds.add(p.id);
      if (!isText(p.name)) err(`${at} ("${p.id}"): name must be a non-empty string`);
      if (p.kind !== undefined && !SLOT_KINDS.includes(p.kind)) err(`${at} ("${p.id}"): kind must be one of ${SLOT_KINDS.join(', ')}`);
    });

  // --- bells
  const bellIds = new Set();
  const usedPeriods = new Set();
  if (!Array.isArray(s.bells) || s.bells.length === 0) err('bells must be a non-empty array (bells[0] is the regular day)');
  else
    s.bells.forEach((b, bi) => {
      const at = `bells[${bi}]${isObj(b) && isText(b.id) ? ` "${b.id}"` : ''}`;
      if (!isObj(b)) return err(`${at} must be an object { id, name, days }`);
      unknownKeys(b, 'bell', at);
      if (!isText(b.id)) err(`${at}: id must be a non-empty string`);
      else if (bellIds.has(b.id)) err(`${at}: duplicate bell id "${b.id}"`);
      else bellIds.add(b.id);
      if (!isText(b.name)) err(`${at}: name must be a non-empty string`);
      if (!isObj(b.days) || Object.keys(b.days).length === 0) return err(`${at}: days must be an object like { "*": [slots] }`);
      for (const [key, slots] of Object.entries(b.days)) {
        const dat = `${at} days["${key}"]`;
        if (key !== '*' && !cycleIds.has(key)) err(`${dat}: "${key}" is not "*" or a cycle day id (${[...cycleIds].join(', ') || 'none defined'})`);
        if (!Array.isArray(slots)) {
          err(`${dat} must be an array of slots`);
          continue;
        }
        if (slots.length === 0) warn(`${dat} has no slots`);
        let prev;
        slots.forEach((x, si) => {
          const sat = `${dat}[${si}]`;
          if (!isObj(x)) return err(`${sat} must be an object { period, start, end }`);
          unknownKeys(x, 'slot', sat);
          if (!isText(x.period)) err(`${sat}: period must be a non-empty string`);
          else if (!periodIds.has(x.period)) err(`${sat}: period "${x.period}" is not in periods`);
          else usedPeriods.add(x.period);
          if (x.label !== undefined && typeof x.label !== 'string') err(`${sat}: label must be a string`);
          if (x.kind !== undefined && !SLOT_KINDS.includes(x.kind)) err(`${sat}: kind must be one of ${SLOT_KINDS.join(', ')}`);
          const a = parseTime(x.start);
          const z = parseTime(x.end);
          if (a === null) err(`${sat}: start ${JSON.stringify(x.start)} is not a 24-hour "HH:MM" time`);
          if (z === null) err(`${sat}: end ${JSON.stringify(x.end)} is not a 24-hour "HH:MM" time`);
          if (a === null || z === null) return;
          if (a >= z) err(`${sat}: start ${x.start} must be before end ${x.end}`);
          if (prev) {
            if (a < prev.start) err(`${sat}: slots must be in time order (${x.start} comes after ${prev.raw.start})`);
            else if (a < prev.end) err(`${sat}: ${x.start}-${x.end} overlaps the slot before it (${prev.raw.start}-${prev.raw.end})`);
          }
          prev = { start: a, end: z, raw: x };
        });
      }
      for (const id of cycleIds) if (isObj(b.days) && !b.days[id] && !b.days['*']) err(`${at}: no slots for cycle day "${id}" (add days["${id}"] or a "*" fallback)`);
    });
  for (const id of periodIds) if (!usedPeriods.has(id)) warn(`period "${id}" is not used by any bell`);

  // --- calendar
  const cal = s.calendar;
  let summary;
  if (!isObj(cal)) err('calendar is missing (expected { firstDay, lastDay, noSchool, specialDays })');
  else {
    unknownKeys(cal, 'calendar', 'calendar');
    const first = parseDate(cal.firstDay);
    const last = parseDate(cal.lastDay);
    if (first === null) err(`calendar.firstDay ${JSON.stringify(cal.firstDay)} is not a valid "YYYY-MM-DD" date`);
    if (last === null) err(`calendar.lastDay ${JSON.stringify(cal.lastDay)} is not a valid "YYYY-MM-DD" date`);
    const yearOk = first !== null && last !== null && first <= last;
    if (first !== null && last !== null && first > last) err(`calendar.firstDay ${cal.firstDay} is after lastDay ${cal.lastDay}`);
    if (yearOk && (last - first) / DAY_MS > MAX_YEAR_SPAN_DAYS) err(`calendar spans ${(last - first) / DAY_MS} days (${cal.firstDay} to ${cal.lastDay}); is a year mistyped?`);
    if (first !== null && [0, 6].includes(weekdayOf(first))) warn(`calendar.firstDay ${cal.firstDay} is a weekend day`);
    if (last !== null && [0, 6].includes(weekdayOf(last))) warn(`calendar.lastDay ${cal.lastDay} is a weekend day`);
    if (year && first !== null && new Date(first).getUTCFullYear() !== Number(year[1])) warn(`calendar.firstDay ${cal.firstDay} is not in ${year[1]} (schoolYear ${s.schoolYear})`);

    const inYear = (t) => yearOk && t >= first && t <= last;
    const offDays = new Set();

    if (!Array.isArray(cal.noSchool)) err('calendar.noSchool must be an array (use [] for none)');
    else {
      const ranges = [];
      cal.noSchool.forEach((ns, i) => {
        const at = `calendar.noSchool[${i}]${isObj(ns) && isText(ns.name) ? ` "${ns.name}"` : ''}`;
        if (!isObj(ns)) return err(`${at} must be an object { date, end?, name }`);
        unknownKeys(ns, 'noSchool', at);
        const a = parseDate(ns.date);
        if (a === null) return err(`${at}: date ${JSON.stringify(ns.date)} is not a valid "YYYY-MM-DD" date`);
        let z = a;
        if (ns.end !== undefined) {
          z = parseDate(ns.end);
          if (z === null) return err(`${at}: end ${JSON.stringify(ns.end)} is not a valid "YYYY-MM-DD" date`);
          if (z < a) return err(`${at}: end ${ns.end} is before date ${ns.date}`);
          if (z === a) warn(`${at}: end is the same as date; leave end out for a single day`);
        }
        if (!isText(ns.name)) err(`${at}: name must be a non-empty string`);
        if (yearOk && (!inYear(a) || !inYear(z))) err(`${at}: ${ns.date}${ns.end ? ` to ${ns.end}` : ''} is outside the school year ${cal.firstDay} to ${cal.lastDay}`);
        let weekdays = 0;
        for (let t = a; t <= z; t += DAY_MS) {
          offDays.add(t);
          if (![0, 6].includes(weekdayOf(t))) weekdays++;
        }
        if (weekdays === 0) warn(`${at}: only covers a weekend`);
        for (const r of ranges) if (a <= r.z && r.a <= z) warn(`${at} overlaps ${r.at}`);
        if (ranges.length && a < ranges[ranges.length - 1].a) warn(`${at}: noSchool entries are easier to read in date order`);
        ranges.push({ a, z, at });
      });
    }

    const isSchoolDay = (t) => inYear(t) && ![0, 6].includes(weekdayOf(t)) && !offDays.has(t);

    if (!Array.isArray(cal.specialDays)) err('calendar.specialDays must be an array (use [] for none)');
    else {
      const seen = new Map();
      let prevDate = null;
      cal.specialDays.forEach((sd, i) => {
        const at = `calendar.specialDays[${i}]${isObj(sd) && typeof sd.date === 'string' ? ` ${sd.date}` : ''}`;
        if (!isObj(sd)) return err(`${at} must be an object { date, name?, bell?, cycleDay?, advance? }`);
        unknownKeys(sd, 'specialDay', at);
        const t = parseDate(sd.date);
        if (t === null) return err(`${at}: date ${JSON.stringify(sd.date)} is not a valid "YYYY-MM-DD" date`);
        if (seen.has(t)) err(`${at}: another special day (#${seen.get(t)}) already uses ${sd.date}; only the first one counts, so merge them`);
        seen.set(t, i);
        if (prevDate !== null && t < prevDate) warn(`${at}: specialDays are easier to read in date order`);
        prevDate = t;
        if (yearOk && !inYear(t)) err(`${at}: outside the school year ${cal.firstDay} to ${cal.lastDay}`);
        else if (yearOk && !isSchoolDay(t)) err(`${at}: ${sd.date} is not a school day (weekend or noSchool), so this entry has no effect`);
        if (sd.name !== undefined && typeof sd.name !== 'string') err(`${at}: name must be a string`);
        if (sd.bell !== undefined && !bellIds.has(sd.bell)) err(`${at}: bell "${sd.bell}" is not one of the bell ids (${[...bellIds].join(', ')})`);
        if (sd.cycleDay !== undefined && !cycleIds.has(sd.cycleDay)) err(`${at}: cycleDay "${sd.cycleDay}" is not one of the cycle day ids (${[...cycleIds].join(', ')})`);
        if (sd.advance !== undefined && typeof sd.advance !== 'boolean') err(`${at}: advance must be true or false`);
        if (!isText(sd.name) && sd.bell === undefined && sd.cycleDay === undefined && sd.advance === undefined) warn(`${at}: has no name, bell, cycleDay or advance, so it does nothing`);
      });
    }

    if (cal.anchor !== undefined) {
      const an = cal.anchor;
      if (!isObj(an)) err('calendar.anchor must be an object { date, cycleDay }');
      else {
        unknownKeys(an, 'anchor', 'calendar.anchor');
        const t = parseDate(an.date);
        if (t === null) err(`calendar.anchor.date ${JSON.stringify(an.date)} is not a valid "YYYY-MM-DD" date`);
        else if (yearOk && !inYear(t)) err(`calendar.anchor.date ${an.date} is outside the school year ${cal.firstDay} to ${cal.lastDay}`);
        else if (yearOk && !isSchoolDay(t)) err(`calendar.anchor.date ${an.date} is not a school day; anchor on a day the cycle day is known`);
        if (!cycleIds.has(an.cycleDay)) err(`calendar.anchor.cycleDay "${an.cycleDay}" is not one of the cycle day ids (${[...cycleIds].join(', ')})`);
        if (mode === 'weekday') warn('calendar.anchor is ignored in weekday mode');
      }
    }

    if (yearOk) {
      const perMonth = new Map();
      let total = 0;
      for (let t = first; t <= last; t += DAY_MS) {
        if (!isSchoolDay(t)) continue;
        total++;
        const d = new Date(t);
        const k = `${MONTHS[d.getUTCMonth()]}`;
        perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
      }
      const months = [...perMonth].map(([m, n]) => `${m} ${n}`).join(', ');
      summary = `${cal.firstDay} to ${cal.lastDay}, ${total} school days (${months})`;
    }
  }

  // --- source
  if (s.source !== undefined) {
    const src = s.source;
    if (!isObj(src)) err('source must be an object { urls, note?, verified, retrieved? }');
    else {
      unknownKeys(src, 'source', 'source');
      if (!Array.isArray(src.urls)) err('source.urls must be an array of links');
      else
        src.urls.forEach((u, i) => {
          if (typeof u !== 'string' || !/^https?:\/\/\S+$/.test(u)) err(`source.urls[${i}] is not an http(s) link: ${JSON.stringify(u)}`);
        });
      if (typeof src.verified !== 'boolean') err('source.verified must be true or false');
      if (src.verified === true && (!Array.isArray(src.urls) || src.urls.length === 0)) err('source.verified is true but source.urls is empty');
      if (src.note !== undefined && typeof src.note !== 'string') err('source.note must be a string');
      if (src.retrieved !== undefined && parseDate(src.retrieved) === null) err(`source.retrieved ${JSON.stringify(src.retrieved)} is not a valid "YYYY-MM-DD" date`);
    }
  }

  if (summary && isObj(s.cycle) && Array.isArray(s.bells)) {
    const days = Array.isArray(s.cycle.days) ? s.cycle.days.map((d) => d?.id).join('/') : '';
    summary = `${s.schoolYear}, ${mode} ${days}, ${s.bells.length} bell${s.bells.length === 1 ? '' : 's'}, ${summary}`;
  }
  return { errors, warnings, summary };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function defaultFiles() {
  const dir = join(ROOT, 'public', 'schools');
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name, 'schedule.json'))
    .filter((f) => existsSync(f))
    .sort();
}

function checkFile(file) {
  const rel = relative(process.cwd(), file) || file;
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`${rel}\n  error: ${e instanceof SyntaxError ? `invalid JSON: ${e.message}` : e.message}`);
    return false;
  }
  const expectId = basename(dirname(resolve(file)));
  const { errors, warnings, summary } = validateSchedule(data, { expectId: SCHOOL_IDS.includes(expectId) ? expectId : undefined });
  console.log(`${rel}: ${errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}` : 'OK'}${summary ? ` (${summary})` : ''}`);
  for (const e of errors) console.log(`  error: ${e}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  return errors.length === 0;
}

function selfTest() {
  const base = () => ({
    schoolId: 'other',
    schoolYear: '2026-2027',
    cycle: { mode: 'rotation', days: [{ id: 'A', name: 'A Day' }, { id: 'B', name: 'B Day' }] },
    periods: [{ id: '1', name: 'Period 1' }, { id: '2', name: 'Period 2' }, { id: 'L', name: 'Lunch', kind: 'lunch' }],
    bells: [
      {
        id: 'regular',
        name: 'Regular day',
        days: {
          A: [{ period: '1', start: '08:00', end: '09:00' }, { period: 'L', start: '09:05', end: '09:35' }, { period: '2', start: '09:40', end: '10:40' }],
          B: [{ period: '2', start: '08:00', end: '09:00' }, { period: 'L', start: '09:05', end: '09:35' }, { period: '1', start: '09:40', end: '10:40' }],
        },
      },
      { id: 'early', name: 'Early dismissal', days: { '*': [{ period: '1', start: '08:00', end: '08:30' }, { period: '2', start: '08:35', end: '09:05' }] } },
    ],
    calendar: {
      firstDay: '2026-09-02',
      lastDay: '2027-06-17',
      anchor: { date: '2026-09-02', cycleDay: 'A' },
      noSchool: [{ date: '2026-09-07', name: 'Labor Day' }, { date: '2026-12-24', end: '2027-01-01', name: 'Winter recess' }],
      specialDays: [{ date: '2026-11-25', name: 'Early dismissal', bell: 'early' }],
    },
    source: { urls: ['https://example.org/calendar.pdf'], verified: false, retrieved: '2026-10-08' },
  });
  const cases = [
    ['a valid schedule', () => {}, null],
    ['wrong folder', () => {}, 'match its folder', { expectId: 'hsn' }],
    ['bad schoolYear', (s) => (s.schoolYear = '2026-28'), 'schoolYear'],
    ['bad cycle mode', (s) => (s.cycle.mode = 'daily'), 'cycle.mode'],
    ['weekday ids in weekday mode', (s) => ((s.cycle.mode = 'weekday'), (s.calendar.anchor = undefined)), 'weekday mode needs ids'],
    ['duplicate period', (s) => s.periods.push({ id: '1', name: 'Again' }), 'duplicate period id'],
    ['unknown period in a slot', (s) => (s.bells[0].days.A[0].period = '9'), 'period "9" is not in periods'],
    ['bad time', (s) => (s.bells[0].days.A[0].start = '8:00'), 'not a 24-hour'],
    ['start after end', (s) => (s.bells[0].days.A[0].end = '07:00'), 'must be before end'],
    ['unsorted slots', (s) => s.bells[0].days.A.reverse(), 'time order'],
    ['overlapping slots', (s) => (s.bells[0].days.A[1].start = '08:30'), 'overlaps'],
    ['unknown days key', (s) => (s.bells[1].days.C = []), 'is not "*" or a cycle day id'],
    ['cycle day without slots', (s) => delete s.bells[0].days.B, 'no slots for cycle day "B"'],
    ['duplicate bell id', (s) => (s.bells[1].id = 'regular'), 'duplicate bell id'],
    ['invalid date', (s) => (s.calendar.noSchool[0].date = '2026-02-30'), 'not a valid'],
    ['range end before start', (s) => (s.calendar.noSchool[1].end = '2026-12-01'), 'is before date'],
    ['range outside the year', (s) => (s.calendar.noSchool[0].date = '2027-08-01'), 'outside the school year'],
    ['firstDay after lastDay', (s) => (s.calendar.lastDay = '2026-06-01'), 'is after lastDay'],
    ['special day with unknown bell', (s) => (s.calendar.specialDays[0].bell = 'half'), 'bell "half"'],
    ['special day on a holiday', (s) => (s.calendar.specialDays[0].date = '2026-12-28'), 'not a school day'],
    ['special day with unknown cycle day', (s) => (s.calendar.specialDays[0].cycleDay = 'Z'), 'cycleDay "Z"'],
    ['two special days on one date', (s) => s.calendar.specialDays.push({ date: '2026-11-25', name: 'Again' }), 'already uses'],
    ['anchor with unknown cycle day', (s) => (s.calendar.anchor.cycleDay = 'Q'), 'anchor.cycleDay "Q"'],
    ['anchor on a weekend', (s) => (s.calendar.anchor.date = '2026-09-05'), 'not a school day'],
    ['verified without urls', (s) => ((s.source.verified = true), (s.source.urls = [])), 'urls is empty'],
    ['non-http url', (s) => (s.source.urls = ['ftp://x']), 'not an http(s) link'],
  ];
  let failed = 0;
  for (const [name, mutate, expected, opts] of cases) {
    const s = base();
    mutate(s);
    const { errors } = validateSchedule(s, opts);
    const ok = expected === null ? errors.length === 0 : errors.some((e) => e.includes(expected));
    if (!ok) {
      failed++;
      console.log(`FAIL ${name}: expected ${expected === null ? 'no errors' : `an error containing "${expected}"`}, got ${JSON.stringify(errors)}`);
    }
  }
  const extra = [
    ['not an object', () => validateSchedule('nope').errors.some((e) => e.includes('JSON object'))],
    ['date and time parsing', () => parseDate('2027-02-29') === null && parseDate('2028-02-29') !== null && parseTime('24:00') === null && parseTime('14:50') === 890],
    // 2026-09-02..2027-06-17 has 207 weekdays; minus Labor Day and 7 weekdays of winter recess
    ['summary counts school days', () => validateSchedule(base()).summary?.startsWith('2026-2027, rotation A/B, 2 bells, 2026-09-02 to 2027-06-17, 199 school days (Sep 20,')],
  ];
  for (const [name, check] of extra) {
    if (!check()) {
      failed++;
      console.log(`FAIL ${name}`);
    }
  }
  const total = cases.length + extra.length;
  console.log(`self-test: ${total - failed}/${total} passed`);
  return failed === 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const files = args.length ? args.map((f) => resolve(f)) : defaultFiles();
  if (files.length === 0) {
    console.log('no schedule.json files found under public/schools/');
    process.exit(1);
  }
  const results = files.map(checkFile);
  process.exit(results.every(Boolean) ? 0 : 1);
}
