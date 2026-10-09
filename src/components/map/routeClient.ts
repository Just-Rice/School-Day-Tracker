// Runs route queries in src/lib/navWorker.ts, or on the main thread when a worker can't start
// (old browsers, tests). One worker serves every school; each school's grid is built once.
import { useEffect, useState } from 'react';
import type { SchoolMapData } from '../../types';
import { createNavGrid, solveRoute, type NavGrid, type NavRoute, type RouteQuery } from '../../lib/nav';
import type { NavRequest, NavResponse } from '../../lib/navWorker';

interface Pending {
  resolve(r: NavRoute | null): void;
  reject(e: Error): void;
  /** answers on the main thread instead, if the worker dies */
  fallback(): void;
}

let worker: Worker | null | undefined;
const pending = new Map<number, Pending>();
const sent = new Set<string>();
let seq = 0;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('../../lib/navWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<NavResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if ('error' in e.data) p.reject(new Error(e.data.error));
      else p.resolve(e.data.route);
    };
    w.onerror = (e) => {
      e.preventDefault();
      w.terminate();
      worker = null;
      const all = [...pending.values()];
      pending.clear();
      all.forEach((p) => p.fallback());
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

const localGrids = new Map<string, NavGrid>();

function solveHere(key: string, data: SchoolMapData, q: RouteQuery): NavRoute | null {
  let grid = localGrids.get(key);
  if (!grid) {
    grid = createNavGrid(data);
    localGrids.set(key, grid);
  }
  return solveRoute(grid, data, q);
}

function send(w: Worker, msg: NavRequest) {
  w.postMessage(msg);
}

/** starts building a school's grid in the background, so the first route comes back quickly */
export function prepareRouting(key: string, data: SchoolMapData) {
  const w = getWorker();
  if (!w || sent.has(key)) return;
  sent.add(key);
  send(w, { id: 0, type: 'init', key, data });
}

export function findRoute(key: string, data: SchoolMapData, query: RouteQuery): Promise<NavRoute | null> {
  const here = () =>
    new Promise<NavRoute | null>((resolve, reject) => {
      // a macrotask, so a "Finding a route…" state can paint first
      setTimeout(() => {
        try {
          resolve(solveHere(key, data, query));
        } catch (e) {
          reject(e as Error);
        }
      }, 0);
    });
  const w = getWorker();
  if (!w) return here();
  prepareRouting(key, data);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, fallback: () => here().then(resolve, reject) });
    send(w, { id, type: 'route', key, query });
  });
}

export interface RouteState {
  route: NavRoute | null;
  loading: boolean;
  error: string | null;
}

/** the route for a query; `queryKey` identifies the query (the query object itself may be new each render) */
export function useRoute(key: string, data: SchoolMapData | null, query: RouteQuery | null, queryKey: string): RouteState {
  const [state, setState] = useState<RouteState & { for: string }>({ route: null, loading: false, error: null, for: '' });
  // reruns when queryKey changes, not on every new (but equal) query object
  useEffect(() => {
    if (!data || !query) return;
    let live = true;
    setState({ route: null, loading: true, error: null, for: queryKey });
    findRoute(key, data, query).then(
      (route) => live && setState({ route, loading: false, error: route ? null : 'No walking route found between these places.', for: queryKey }),
      (e: Error) => live && setState({ route: null, loading: false, error: e.message, for: queryKey }),
    );
    return () => {
      live = false;
    };
  }, [key, data, queryKey]);
  if (!data || !query) return { route: null, loading: false, error: null };
  if (state.for !== queryKey) return { route: null, loading: true, error: null };
  return state;
}
