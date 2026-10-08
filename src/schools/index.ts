import type { SchoolId, SchoolMapData, SchoolSchedule } from '../types';

export interface SchoolMeta {
  id: SchoolId;
  name: string;
  short: string;
  address?: string;
  grades?: [number, number];
  /** accent color (school colors) */
  color: string;
  hasMap: boolean;
  /** link to the walkable 3D model */
  model3d?: string;
  /**
   * How the 2-D map is drawn from world (x, z) meters:
   * 'north-up-xz': map u = z, v = -x (HSN: world +x is north)
   * 'plan': map u = x, v = z, the floor plan's own orientation (CMS: plan-up is 15° east of north)
   */
  mapOrientation?: 'north-up-xz' | 'plan';
  /** degrees clockwise from map-up to true north, for the compass */
  northDeg?: number;
  floorNames?: string[];
}

export const SCHOOLS: Record<SchoolId, SchoolMeta> = {
  hsn: {
    id: 'hsn',
    name: 'West Windsor-Plainsboro High School North',
    short: 'HSN',
    address: '90 Grovers Mill Road, Plainsboro, NJ',
    grades: [9, 12],
    color: '#1f45a8',
    hasMap: true,
    model3d: 'https://just-rice.github.io/hsn-3d/',
    mapOrientation: 'north-up-xz',
    northDeg: 0,
    floorNames: ['1st floor', '2nd floor'],
  },
  cms: {
    id: 'cms',
    name: 'Community Middle School',
    short: 'CMS',
    address: '55 Grovers Mill Road, Plainsboro, NJ',
    grades: [6, 8],
    color: '#b3202a',
    hasMap: true,
    model3d: 'https://just-rice.github.io/cms-3d/',
    mapOrientation: 'plan',
    northDeg: -15,
    floorNames: ['1st floor', '2nd floor'],
  },
  other: {
    id: 'other',
    name: 'Another school',
    short: 'Other',
    color: '#4b5563',
    hasMap: false,
  },
};

export const SCHOOL_LIST: SchoolMeta[] = [SCHOOLS.hsn, SCHOOLS.cms, SCHOOLS.other];

const base = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

function getJSON<T>(path: string): Promise<T> {
  const url = base + path;
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url) as Promise<T>;
}

/** public/schools/<id>/schedule.json; 'other' uses the blank template */
export function loadSchoolSchedule(id: SchoolId): Promise<SchoolSchedule> {
  return getJSON<SchoolSchedule>(`schools/${id}/schedule.json`);
}

/** public/schools/<id>/map.json (only for schools with hasMap) */
export function loadSchoolMap(id: SchoolId): Promise<SchoolMapData> {
  if (!SCHOOLS[id].hasMap) return Promise.reject(new Error(`${SCHOOLS[id].short} has no map yet`));
  return getJSON<SchoolMapData>(`schools/${id}/map.json`);
}
