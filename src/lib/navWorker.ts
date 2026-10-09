// Route finding off the main thread: building a school's grid takes a few hundred ms and a long
// route up to ~80 ms, which would stall panning and typing. The page talks to this worker through
// src/components/map/routeClient.ts, which falls back to the main thread when workers aren't
// available.
import type { SchoolMapData } from '../types';
import { createNavGrid, solveRoute, type NavGrid, type NavRoute, type RouteQuery } from './nav';

export type NavRequest = { id: number; type: 'init'; key: string; data: SchoolMapData } | { id: number; type: 'route'; key: string; query: RouteQuery };

export type NavResponse = { id: number; route: NavRoute | null } | { id: number; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const schools = new Map<string, { data: SchoolMapData; grid: NavGrid | null }>();

function gridFor(key: string): { data: SchoolMapData; grid: NavGrid } {
  const s = schools.get(key);
  if (!s) throw new Error(`No map loaded for ${key}`);
  s.grid ??= createNavGrid(s.data);
  return s as { data: SchoolMapData; grid: NavGrid };
}

ctx.onmessage = (e: MessageEvent<NavRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      if (!schools.has(msg.key)) schools.set(msg.key, { data: msg.data, grid: null });
      gridFor(msg.key);
      return;
    }
    const { data, grid } = gridFor(msg.key);
    const res: NavResponse = { id: msg.id, route: solveRoute(grid, data, msg.query) };
    ctx.postMessage(res);
  } catch (err) {
    if (msg.type === 'route') ctx.postMessage({ id: msg.id, error: (err as Error).message } satisfies NavResponse);
  }
};
