// Date and time helpers. Dates are 'YYYY-MM-DD' strings in the device's local time zone and
// times are 'HH:MM' (24-hour), so nothing here depends on UTC offsets.
import type { ClockTime, ISODate } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** local midnight of an ISO date */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** whole days from a to b (b - a) */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(s: ISODate): number {
  return parseISODate(s).getDay();
}

export function isWeekend(s: ISODate): boolean {
  const w = weekday(s);
  return w === 0 || w === 6;
}

/** Monday of the week containing s */
export function startOfWeek(s: ISODate): ISODate {
  const w = weekday(s);
  return addDays(s, w === 0 ? -6 : 1 - w);
}

/** 'HH:MM' -> minutes after midnight */
export function toMinutes(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): ClockTime {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function minutesNow(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

export function formatTime(t: ClockTime, clock: '12h' | '24h' = '12h'): string {
  if (clock === '24h') return t;
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 'Mon, Oct 6' (or with year when it isn't this year) */
export function formatDate(s: ISODate, opts: { long?: boolean; weekday?: boolean } = {}): string {
  const d = parseISODate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: opts.weekday === false ? undefined : opts.long ? 'long' : 'short',
    month: opts.long ? 'long' : 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** 'Today', 'Tomorrow', 'Yesterday', 'in 3 days', '2 days ago', else formatDate */
export function relativeDay(s: ISODate, today: ISODate = todayISO()): string {
  const n = daysBetween(today, s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDate(s, { long: true }).split(',')[0];
  if (n < -1 && n > -7) return `${-n} days ago`;
  return formatDate(s);
}

/** '1 h 05 min', '12 min', '45 s' */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))} s`;
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}
