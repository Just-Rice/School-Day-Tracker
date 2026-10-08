import type { Assignment, ClassInfo, Profile } from '../types';
import { clean, type DataStore, type Unsubscribe } from './store';

const KEY = 'sdt:v1:';

type Listener = () => void;

/** Keeps everything in localStorage. Changes in other tabs arrive through the storage event. */
export class LocalStore implements DataStore {
  readonly kind = 'local' as const;
  private listeners = new Map<string, Set<Listener>>();
  private prefix: string;

  constructor(namespace = 'local') {
    this.prefix = KEY + namespace + ':';
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith(this.prefix)) this.emit(e.key.slice(this.prefix.length));
      });
    }
  }

  private read<T>(k: string, fallback: T): T {
    try {
      const s = localStorage.getItem(this.prefix + k);
      return s ? (JSON.parse(s) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(k: string, v: unknown) {
    try {
      localStorage.setItem(this.prefix + k, JSON.stringify(clean(v)));
    } catch (e) {
      console.warn('Could not save to this browser', e);
      throw new Error('Could not save to this browser (storage may be full or blocked).');
    }
    this.emit(k);
  }
  private emit(k: string) {
    this.listeners.get(k)?.forEach((l) => l());
  }
  private on(k: string, l: Listener): Unsubscribe {
    if (!this.listeners.has(k)) this.listeners.set(k, new Set());
    this.listeners.get(k)!.add(l);
    l();
    return () => this.listeners.get(k)!.delete(l);
  }

  subscribeProfile(cb: (p: Profile | null) => void): Unsubscribe {
    return this.on('profile', () => cb(this.read<Profile | null>('profile', null)));
  }
  async saveProfile(p: Partial<Profile>) {
    const cur = this.read<Partial<Profile>>('profile', {});
    this.write('profile', { ...cur, ...p, updatedAt: Date.now() });
  }

  subscribeClasses(cb: (c: ClassInfo[]) => void): Unsubscribe {
    return this.on('classes', () => cb(this.read<ClassInfo[]>('classes', [])));
  }
  async saveClass(c: ClassInfo) {
    const all = this.read<ClassInfo[]>('classes', []).filter((x) => x.id !== c.id);
    this.write('classes', [...all, c]);
  }
  async deleteClass(id: string) {
    this.write('classes', this.read<ClassInfo[]>('classes', []).filter((x) => x.id !== id));
  }

  subscribeAssignments(cb: (a: Assignment[]) => void): Unsubscribe {
    return this.on('assignments', () => cb(this.read<Assignment[]>('assignments', [])));
  }
  async saveAssignment(a: Assignment) {
    const all = this.read<Assignment[]>('assignments', []).filter((x) => x.id !== a.id);
    this.write('assignments', [...all, a]);
  }
  async deleteAssignment(id: string) {
    this.write('assignments', this.read<Assignment[]>('assignments', []).filter((x) => x.id !== id));
  }

  /** true if this browser has any local-mode data (used to offer importing it after sign-in) */
  hasData(): boolean {
    return this.read<ClassInfo[]>('classes', []).length > 0 || this.read<Assignment[]>('assignments', []).length > 0;
  }
  snapshot() {
    return {
      profile: this.read<Profile | null>('profile', null),
      classes: this.read<ClassInfo[]>('classes', []),
      assignments: this.read<Assignment[]>('assignments', []),
    };
  }
  clear() {
    for (const k of ['profile', 'classes', 'assignments']) {
      localStorage.removeItem(this.prefix + k);
      this.emit(k);
    }
  }
}

export const localStore = new LocalStore();
