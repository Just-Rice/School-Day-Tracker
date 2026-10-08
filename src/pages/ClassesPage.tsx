import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Page } from '../components/ui';
import ClassCard from '../components/classes/ClassCard';
import { useData } from '../data/DataProvider';
import { useSchedule } from '../hooks/useSchedule';
import { describePeriods, matchesQuery, sortByPeriod, withClassDefaults } from '../lib/classes';
import { SCHOOLS } from '../schools';
import './classes.css';

const STORE_IDEAS = [
  ['🕘', 'Period, days and room', 'with times from the bell schedule'],
  ['👩‍🏫', 'Teacher', 'email, phone, website and extra-help hours'],
  ['🔗', 'Links', 'Google Classroom, textbook, class folders'],
  ['📝', 'Course details', 'materials, grading policy and your grade'],
  ['🗂️', 'Anything else', 'locker #, seat, Classroom code…'],
];

export default function ClassesPage() {
  const { classes, assignments, profile } = useData();
  const { schedule } = useSchedule();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived } = useMemo(() => {
    const periodIds = schedule?.periods.map((p) => p.id) ?? [];
    const all = sortByPeriod(classes.map(withClassDefaults), periodIds);
    return { active: all.filter((c) => !c.archived), archived: all.filter((c) => c.archived) };
  }, [classes, schedule]);

  const openCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) if (a.classId && a.status !== 'done') m.set(a.classId, (m.get(a.classId) ?? 0) + 1);
    return m;
  }, [assignments]);

  // class periods nobody is in yet, to make setting up the schedule quick
  const emptyPeriods = useMemo(() => {
    if (!schedule || active.length === 0) return [];
    return schedule.periods.filter((p) => (!p.kind || p.kind === 'class') && !active.some((c) => c.periods.includes(p.id)));
  }, [schedule, active]);

  const q = query.trim();
  const shownActive = q ? active.filter((c) => matchesQuery(c, q, schedule)) : active;
  const shownArchived = showArchived ? (q ? archived.filter((c) => matchesQuery(c, q, schedule)) : archived) : [];
  const school = SCHOOLS[profile.schoolId];
  const total = active.length;

  const addButton = (
    <Link to="/classes/new" className="btn btn-primary">
      + Add class
    </Link>
  );

  if (classes.length === 0) {
    return (
      <Page title="Classes" actions={addButton}>
        <Card>
          <EmptyState icon="📚" title="Add your classes" action={addButton}>
            Keep every detail of each class in one place. Your Today and Week pages use them to show where you need to be and when{school.hasMap ? ', and the map can walk you to each room' : ''}.
          </EmptyState>
          <ul className="store-ideas">
            {STORE_IDEAS.map(([icon, title, text]) => (
              <li key={title}>
                <span className="store-icon" aria-hidden>
                  {icon}
                </span>
                <span>
                  <strong>{title}</strong>
                  <span className="muted"> · {text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Classes" subtitle={`${total} class${total === 1 ? '' : 'es'}${archived.length ? ` · ${archived.length} archived` : ''}`} actions={addButton}>
      <div className="classes-toolbar">
        <input type="search" className="classes-search" placeholder="Search classes, teachers, rooms…" aria-label="Search classes" value={query} onChange={(e) => setQuery(e.target.value)} />
        {archived.length > 0 && (
          <label className="check nowrap">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        )}
      </div>

      {shownActive.length > 0 && (
        <ul className="class-grid" aria-label="Classes">
          {shownActive.map((c) => (
            <li key={c.id}>
              <ClassCard cls={c} schedule={schedule} openCount={openCounts.get(c.id) ?? 0} />
            </li>
          ))}
        </ul>
      )}

      {q && shownActive.length === 0 && shownArchived.length === 0 && (
        <Card>
          <EmptyState icon="🔎" title={`No classes match “${q}”`}>
            Search looks at names, teachers, rooms, periods and your extra details.
            {!showArchived && archived.length > 0 ? ' Archived classes are hidden.' : ''}
          </EmptyState>
        </Card>
      )}

      {!q && active.length === 0 && (
        <Card>
          <EmptyState icon="🗄️" title="All your classes are archived" action={addButton}>
            Archived classes are hidden from your schedule. Turn on “Show archived” to see them.
          </EmptyState>
        </Card>
      )}

      {shownArchived.length > 0 && (
        <section className="stack" aria-labelledby="archived-head">
          <h2 id="archived-head" className="classes-section-head">
            Archived
          </h2>
          <ul className="class-grid" aria-label="Archived classes">
            {shownArchived.map((c) => (
              <li key={c.id}>
                <ClassCard cls={c} schedule={schedule} openCount={openCounts.get(c.id) ?? 0} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!q && emptyPeriods.length > 0 && (
        <p className="muted small empty-periods">
          Nothing in {describePeriods(
            emptyPeriods.map((p) => p.id),
            schedule,
          )}{' '}
          yet:{' '}
          {emptyPeriods.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' '}
              <Link to={`/classes/new?period=${encodeURIComponent(p.id)}`} className="chip">
                + {p.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </Page>
  );
}
