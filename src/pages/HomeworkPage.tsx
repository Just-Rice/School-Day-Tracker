import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Assignment, ClassInfo } from '../types';
import { Button, Card, Dot, EmptyState, Modal, Page } from '../components/ui';
import AssignmentRow from '../components/homework/AssignmentRow';
import HomeworkToolbar, { NO_CLASS, type HomeworkView } from '../components/homework/HomeworkToolbar';
import QuickAdd from '../components/homework/QuickAdd';
import { useToggleDone } from '../components/homework/bits';
import { useData } from '../data/DataProvider';
import { useNow, useSchedule } from '../hooks/useSchedule';
import { minutesNow, todayISO } from '../lib/dates';
import {
  doneOlderThan,
  filterAssignments,
  groupAssignments,
  groupByClass,
  hasActiveFilters,
  isAssignmentType,
  isOverdue,
  isPriority,
  normalizeAssignment,
  sortDone,
  type AssignmentFilters,
} from '../lib/homework';
import './homework.css';

const CLEAR_AFTER_DAYS = 30;
const DONE_PAGE = 50;

function readView(p: URLSearchParams): HomeworkView {
  const v = p.get('view');
  return v === 'class' || v === 'done' ? v : 'upcoming';
}

function readFilters(p: URLSearchParams): AssignmentFilters {
  const c = p.get('class');
  const t = p.get('type');
  const pr = p.get('priority');
  return {
    classId: c === NO_CLASS ? null : (c ?? ''),
    type: isAssignmentType(t) ? t : '',
    priority: isPriority(pr) ? pr : '',
    q: p.get('q') ?? '',
  };
}

function writeParams(view: HomeworkView, f: AssignmentFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (view !== 'upcoming') p.set('view', view);
  if (f.classId === null) p.set('class', NO_CLASS);
  else if (f.classId) p.set('class', f.classId);
  if (f.type) p.set('type', f.type);
  if (f.priority) p.set('priority', f.priority);
  if (f.q) p.set('q', f.q);
  return p;
}

export default function HomeworkPage() {
  const { assignments, classes, profile, deleteAssignment } = useData();
  const { getDay } = useSchedule();
  const now = useNow(60000);
  const today = todayISO(now);
  const nowMinutes = minutesNow(now);
  const clock = profile.clock;

  // view and filters live in the URL so Back from an assignment returns to the same list
  const [params, setParams] = useSearchParams();
  const view = readView(params);
  const filters = useMemo(() => readFilters(params), [params]);
  const { pinned, toggle, unpinAll } = useToggleDone();
  const [confirmClear, setConfirmClear] = useState(false);
  const [doneShown, setDoneShown] = useState(DONE_PAGE);

  const all = useMemo(() => assignments.map(normalizeAssignment), [assignments]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const filtered = useMemo(() => filterAssignments(all, filters, classes), [all, filters, classes]);
  const open = useMemo(() => filtered.filter((a) => a.status !== 'done' || pinned.has(a.id)), [filtered, pinned]);
  const done = useMemo(() => sortDone(filtered), [filtered]);
  const old = useMemo(() => doneOlderThan(all, CLEAR_AFTER_DAYS, now.getTime()), [all, now]);
  const filtering = hasActiveFilters(filters);

  const unfinished = all.filter((a) => a.status !== 'done');
  const overdueCount = unfinished.filter((a) => isOverdue(a, today, nowMinutes)).length;

  const setView = (v: HomeworkView) => {
    unpinAll();
    setDoneShown(DONE_PAGE);
    setParams(writeParams(v, filters), { replace: true });
  };
  const setFilters = (f: AssignmentFilters) => setParams(writeParams(view, f), { replace: true });

  const row = (a: Assignment, extra: { hideClass?: boolean; showCompleted?: boolean } = {}) => (
    <AssignmentRow key={a.id} a={a} cls={a.classId ? classById.get(a.classId) : undefined} today={today} nowMinutes={nowMinutes} clock={clock} onToggle={toggle} {...extra} />
  );

  async function clearOld() {
    setConfirmClear(false);
    try {
      await Promise.all(old.map((a) => deleteAssignment(a.id)));
    } catch {
      // the app shows the error banner
    }
  }

  const noMatches = filtering && (
    <Card>
      <EmptyState icon="🔍" title="No matches" action={<Button onClick={() => setFilters({})}>Clear search and filters</Button>}>
        Nothing {view === 'done' ? 'done' : 'to do'} matches your search and filters.
      </EmptyState>
    </Card>
  );

  let body;
  if (all.length === 0) {
    body = (
      <Card>
        {classes.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No classes yet"
            action={
              <Link className="btn btn-primary" to="/classes/new">
                Add a class
              </Link>
            }
          >
            Add your classes so homework can be sorted by class and due dates can default to the next time the class meets. You can also add homework without a class above.
          </EmptyState>
        ) : (
          <EmptyState icon="📝" title="No homework yet">
            Type an assignment above and press Enter. Tap one to add details like subtasks, links and notes.
          </EmptyState>
        )}
      </Card>
    );
  } else if (view === 'done') {
    body = (
      <Card
        title={
          <>
            Done <span className="hw-group-count">{done.length}</span>
          </>
        }
        actions={
          <Button small variant="ghost" disabled={old.length === 0} onClick={() => setConfirmClear(true)}>
            Clear done older than {CLEAR_AFTER_DAYS} days
          </Button>
        }
        className="hw-group hw-done-card"
      >
        {done.length === 0 ? (
          filtering ? (
            <p className="muted">Nothing done matches your search and filters.</p>
          ) : (
            <p className="muted">Nothing checked off yet. Finished assignments show up here.</p>
          )
        ) : (
          <>
            <ul className="hw-list">{done.slice(0, doneShown).map((a) => row(a, { showCompleted: true }))}</ul>
            {done.length > doneShown && (
              <div className="hw-more">
                <Button small onClick={() => setDoneShown((n) => n + DONE_PAGE)}>
                  Show more ({done.length - doneShown})
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    );
  } else if (open.length === 0) {
    body = noMatches || (
      <Card>
        <EmptyState icon="🎉" title="You're all caught up">
          Nothing left to do. Add new assignments above as you get them.
        </EmptyState>
      </Card>
    );
  } else if (view === 'class') {
    body = groupByClass(open, classes, !filtering).map((g) => <ClassSection key={g.cls?.id ?? 'none'} cls={g.cls} count={g.items.length} rows={g.items.map((a) => row(a, { hideClass: true }))} />);
  } else {
    body = groupAssignments(open, today, { nowMinutes, pinned }).map((g) => (
      <Card
        key={g.key}
        className={'hw-group hw-group-' + g.key}
        title={
          <>
            {g.label} <span className="hw-group-count">{g.items.length}</span>
          </>
        }
      >
        <ul className="hw-list">{g.items.map((a) => row(a))}</ul>
      </Card>
    ));
  }

  return (
    <Page
      title="Homework"
      subtitle={
        unfinished.length === 0 ? (
          all.length ? 'All caught up' : 'Track homework, tests and projects'
        ) : (
          <>
            {unfinished.length} to do
            {overdueCount > 0 && <span className="hw-overdue-text"> · {overdueCount} overdue</span>}
          </>
        )
      }
      actions={
        <Link className="btn btn-secondary" to="/homework/new">
          + Full form
        </Link>
      }
    >
      <QuickAdd classes={classes} today={today} getDay={getDay} initialClassId={filters.classId || undefined} />
      {classes.length === 0 && all.length > 0 && (
        <div className="banner banner-info hw-banner">
          Add your classes to sort homework by class and have due dates default to the next class. <Link to="/classes/new">Add a class</Link>
        </div>
      )}
      {all.length > 0 && (
        <HomeworkToolbar
          view={view}
          onView={setView}
          counts={{ upcoming: unfinished.length, done: all.length - unfinished.length }}
          filters={filters}
          onFilters={setFilters}
          classes={classes}
        />
      )}
      <div className="hw-groups">{body}</div>
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear old done work?"
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={clearOld}>
              Delete {old.length}
            </Button>
          </>
        }
      >
        <p>
          This permanently deletes {old.length} {old.length === 1 ? 'assignment' : 'assignments'} you finished more than {CLEAR_AFTER_DAYS} days ago.
        </p>
      </Modal>
    </Page>
  );
}

function ClassSection({ cls, count, rows }: { cls: ClassInfo | null; count: number; rows: React.ReactNode[] }) {
  return (
    <Card
      className="hw-group hw-class-group"
      style={cls ? ({ '--hw-color': cls.color } as React.CSSProperties) : undefined}
      title={
        <span className="hw-class-title">
          {cls ? <Dot color={cls.color} size={12} /> : null}
          {cls ? (
            <Link to={`/classes/${cls.id}`} className="hw-class-link">
              {cls.icon ? cls.icon + ' ' : ''}
              {cls.name}
            </Link>
          ) : (
            'No class'
          )}
          {count > 0 && <span className="hw-group-count">{count}</span>}
        </span>
      }
      actions={
        <Link className="btn btn-ghost btn-sm" to={cls ? `/homework/new?classId=${encodeURIComponent(cls.id)}` : '/homework/new'} aria-label={`Add homework${cls ? ' for ' + cls.name : ''}`}>
          + Add
        </Link>
      }
    >
      {count === 0 ? <p className="muted small hw-none">Nothing due.</p> : <ul className="hw-list">{rows}</ul>}
    </Card>
  );
}
