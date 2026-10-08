import { useId, useState } from 'react';
import type { ClassInfo } from '../../types';
import { ASSIGNMENT_TYPES, PRIORITIES, isAssignmentType, isPriority, type AssignmentFilters } from '../../lib/homework';
import { Button } from '../ui';

export type HomeworkView = 'upcoming' | 'class' | 'done';

const VIEWS: { id: HomeworkView; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'class', label: 'By class' },
  { id: 'done', label: 'Done' },
];

/** select value for "assignments without a class" */
export const NO_CLASS = 'none';

interface Props {
  view: HomeworkView;
  onView: (v: HomeworkView) => void;
  counts: Partial<Record<HomeworkView, number>>;
  filters: AssignmentFilters;
  onFilters: (f: AssignmentFilters) => void;
  classes: ClassInfo[];
}

/** View switcher, search, and the class/type/priority filters. */
export default function HomeworkToolbar({ view, onView, counts, filters, onFilters, classes }: Props) {
  const panelId = useId();
  const active = [filters.classId !== undefined && filters.classId !== '', !!filters.type, !!filters.priority].filter(Boolean).length;
  const [open, setOpen] = useState(active > 0);
  const set = (p: Partial<AssignmentFilters>) => onFilters({ ...filters, ...p });
  const classValue = filters.classId === null ? NO_CLASS : (filters.classId ?? '');

  return (
    <div className="hw-toolbar">
      <div className="segmented hw-views" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onView(v.id)}>
            {v.label}
            {counts[v.id] ? <span className="hw-count"> {counts[v.id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="hw-search-row">
        <label className="hw-search">
          <span className="sr-only">Search homework</span>
          <input type="search" placeholder="Search" value={filters.q ?? ''} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <Button aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          Filters{active > 0 && <span className="badge">{active}</span>}
        </Button>
      </div>
      {open && (
        <div className="hw-filters" id={panelId}>
          <label className="field">
            <span className="field-label">Class</span>
            <select value={classValue} onChange={(e) => set({ classId: e.target.value === NO_CLASS ? null : e.target.value })}>
              <option value="">All classes</option>
              {classes
                .filter((c) => !c.archived || c.id === filters.classId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              <option value={NO_CLASS}>No class</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Type</span>
            <select value={filters.type ?? ''} onChange={(e) => set({ type: isAssignmentType(e.target.value) ? e.target.value : '' })}>
              <option value="">All types</option>
              {ASSIGNMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Priority</span>
            <select value={filters.priority ?? ''} onChange={(e) => set({ priority: isPriority(e.target.value) ? e.target.value : '' })}>
              <option value="">Any priority</option>
              {[...PRIORITIES].reverse().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {active > 0 && (
            <Button small variant="ghost" className="hw-clear" onClick={() => onFilters({ q: filters.q })}>
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
