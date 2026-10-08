import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ClassInfo, ClassRoom, MapRoom, SchoolId } from '../types';
import { Button, Card, Chip, EmptyState, Page, Spinner } from '../components/ui';
import ClassIcon from '../components/classes/ClassIcon';
import DeleteClassDialog from '../components/classes/DeleteClassDialog';
import MeetingTimes from '../components/classes/MeetingTimes';
import { floorName } from '../components/classes/RoomPicker';
import { errorText, settleSoon } from '../components/classes/saving';
import { useData } from '../data/DataProvider';
import { useNow, useSchedule } from '../hooks/useSchedule';
import { formatDate, formatTime, minutesNow, relativeDay, todayISO } from '../lib/dates';
import { useSchoolMap, type SchoolMapState } from '../lib/mapData';
import {
  LEVEL_COLORS,
  TERM_LABELS,
  classAssignments,
  describeDays,
  describePeriods,
  duplicateClass,
  hostOf,
  matchMapRoom,
  meetingSummary,
  nextMeeting,
  roomLabel,
  safeHref,
  telHref,
  withClassDefaults,
} from '../lib/classes';
import { SCHOOLS } from '../schools';
import type { ClassNavState } from './ClassEditPage';
import './classes.css';

export default function ClassDetailPage() {
  const { id } = useParams();
  const { classes, loading } = useData();
  const found = classes.find((c) => c.id === id);
  const last = useRef(found);
  if (found) last.current = found;
  const [leaving, setLeaving] = useState(false);
  const cls = found ?? (leaving ? last.current : undefined);

  if (loading)
    return (
      <Page title="Class">
        <Spinner />
      </Page>
    );
  if (!cls)
    return (
      <Page title="Class not found">
        <Card>
          <EmptyState
            icon="🔍"
            title="This class doesn’t exist"
            action={
              <Link to="/classes" className="btn btn-primary">
                All classes
              </Link>
            }
          >
            It may have been deleted, or the link is wrong.
          </EmptyState>
        </Card>
      </Page>
    );
  return <ClassDetail key={cls.id} cls={withClassDefaults(cls)} onLeaving={() => setLeaving(true)} />;
}

/** A room, linked to the map (show it / walk there) when it's on the school's map. */
function RoomInfo({ room, schoolId, map }: { room: ClassRoom; schoolId: SchoolId; map: SchoolMapState }) {
  const school = SCHOOLS[schoolId];
  let mapRoom: MapRoom | undefined;
  let key: string | undefined;
  if (school.hasMap) {
    mapRoom = room.mapKey ? map.byKey.get(room.mapKey) : undefined;
    // rooms typed before the map loaded, or keys that no longer exist, by their label
    if (!mapRoom && !map.loading) mapRoom = matchMapRoom(map.rooms, room.label);
    key = mapRoom?.key ?? (map.loading ? room.mapKey : undefined);
  }
  return (
    <div className="room-info">
      <div>
        <strong className="room-title">{mapRoom?.title ?? roomLabel(room)}</strong>
        {mapRoom && <span className="muted"> · {floorName(schoolId, mapRoom.level)}</span>}
      </div>
      {room.where && <div className="muted">{room.where}</div>}
      {key ? (
        <div className="row room-links">
          <Link className="btn btn-sm" to={`/map?to=${encodeURIComponent(key)}`}>
            <span aria-hidden>📍</span> Show on map
          </Link>
          <Link className="btn btn-sm" to={`/map?from=entrance&to=${encodeURIComponent(key)}`}>
            <span aria-hidden>🚶</span> Directions from the front entrance
          </Link>
        </div>
      ) : (
        school.hasMap && !map.loading && <div className="muted small">Not on the {school.short} map.</div>
      )}
    </div>
  );
}

function Pre({ children }: { children: ReactNode }) {
  return <div className="pre-line">{children}</div>;
}

function ExtLink({ href, children }: { href: string | undefined; children: ReactNode }) {
  if (!href) return <>{children}</>;
  const external = /^https?:/.test(href);
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}

function ClassDetail({ cls, onLeaving }: { cls: ClassInfo; onLeaving: () => void }) {
  const { profile, assignments, saveClass } = useData();
  const { schedule, loading: scheduleLoading, error: scheduleError, getDay } = useSchedule();
  const map = useSchoolMap(profile.schoolId);
  const navigate = useNavigate();
  const now = useNow(30000);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const clock = profile.clock;
  const today = todayISO(now);
  const schoolId = profile.schoolId;

  const next = schedule ? nextMeeting(cls, getDay, today, minutesNow(now)) : undefined;
  const hw = classAssignments(assignments, cls.id);
  const t = cls.teacher;
  const hasTeacher = !!(t.name || t.email || t.phone || t.website || t.office || t.officeHours);
  const officeRoom = t.office && SCHOOLS[schoolId].hasMap ? matchMapRoom(map.rooms, t.office) : undefined;
  const hasCourse = !!(cls.grade || cls.materials || cls.gradingPolicy);
  const editState: ClassNavState = { fromDetail: cls.id };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const duplicate = () =>
    act(async () => {
      const copy = duplicateClass(cls);
      await settleSoon(saveClass(copy));
      navigate(`/classes/${copy.id}/edit`);
    });
  const toggleArchive = () => act(() => settleSoon(saveClass({ ...cls, archived: cls.archived ? undefined : true })));

  const missing = [!hasTeacher && 'teacher', cls.links.length === 0 && 'links', !hasCourse && 'materials and grading', !cls.notes && 'notes'].filter(Boolean) as string[];

  let nextLine: ReactNode = null;
  if (next) {
    const where = roomLabel(next.room);
    nextLine = next.now ? (
      <p className="next-line">
        <span className="next-dot" aria-hidden /> <strong>In class now</strong> · until {formatTime(next.slot.end, clock)}
        {where && <> · {where}</>}
      </p>
    ) : (
      <p className="next-line">
        <strong>Next class:</strong> {relativeDay(next.date, today)}
        {next.day.cycleDay && schedule?.cycle.mode !== 'weekday' ? ` (${next.day.cycleDay.name})` : ''} · {formatTime(next.slot.start, clock)}
        {where && <> · {where}</>}
      </p>
    );
  }

  return (
    <Page
      title={
        <span className="detail-title">
          <ClassIcon cls={cls} size={40} />
          <span>{cls.name || 'Untitled class'}</span>
        </span>
      }
      actions={
        <Link to={`/classes/${cls.id}/edit`} state={editState} className="btn btn-primary">
          Edit
        </Link>
      }
    >
      <div className="class-hero" style={{ '--cls': cls.color } as CSSProperties}>
        <div className="row">
          {cls.level && <Chip color={LEVEL_COLORS[cls.level]}>{cls.level}</Chip>}
          <Chip>{TERM_LABELS[cls.term] ?? cls.term}</Chip>
          {cls.courseCode && <Chip title="Course code">Course {cls.courseCode}</Chip>}
          {cls.section && <Chip title="Section">Section {cls.section}</Chip>}
          {cls.credits !== undefined && (
            <Chip>
              {cls.credits} credit{cls.credits === 1 ? '' : 's'}
            </Chip>
          )}
          {cls.archived && <Chip color="var(--warn)">Archived</Chip>}
        </div>
        {nextLine}
      </div>

      {cls.archived && (
        <div className="banner banner-info cls-banner row">
          <span>This class is archived, so it’s hidden from your schedule.</span>
          <span className="spacer" />
          <Button small onClick={toggleArchive} disabled={busy}>
            Unarchive
          </Button>
        </div>
      )}
      {actionError && (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      )}

      <div className="detail-grid">
        <Card title="When" className="detail-when">
          {cls.periods.length === 0 ? (
            <p className="muted">
              No period yet. <Link to={`/classes/${cls.id}/edit`} state={editState}>Add one</Link> to see this class on your Today and Week pages.
            </p>
          ) : schedule ? (
            <>
              <p className="when-summary">{meetingSummary(cls, schedule)}</p>
              <MeetingTimes schedule={schedule} cls={cls} clock={clock} />
            </>
          ) : scheduleLoading ? (
            <Spinner label="Loading the bell schedule…" />
          ) : (
            <>
              <p className="when-summary">
                {describePeriods(cls.periods, null)}
                {cls.days?.length ? ` · ${describeDays(cls.days, null)}` : ''}
              </p>
              <p className="muted small">{scheduleError ?? 'There’s no bell schedule, so times aren’t shown.'}</p>
            </>
          )}
        </Card>

        <Card title="Where">
          {cls.room.label ? (
            <RoomInfo room={cls.room} schoolId={schoolId} map={map} />
          ) : (
            <p className="muted">
              No room yet. <Link to={`/classes/${cls.id}/edit`} state={editState}>Add it</Link>
              {SCHOOLS[schoolId].hasMap ? ' to get directions on the map.' : '.'}
            </p>
          )}
          {cls.altRooms && cls.altRooms.length > 0 && (
            <ul className="list alt-rooms">
              {cls.altRooms.map((a, i) => (
                <li key={i}>
                  <div className="muted small">On {describeDays(a.days, schedule)}</div>
                  <RoomInfo room={a.room} schoolId={schoolId} map={map} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Homework"
          actions={
            <Link to={`/homework/new?classId=${encodeURIComponent(cls.id)}`} className="btn btn-sm">
              + Add assignment
            </Link>
          }
        >
          {hw.open.length === 0 ? (
            <p className="muted">Nothing due for this class{hw.done ? ` · ${hw.done} done` : ''}.</p>
          ) : (
            <>
              <ul className="list hw-list">
                {hw.open.slice(0, 8).map((a) => {
                  const overdue = a.dueDate < today;
                  return (
                    <li key={a.id} className="hw-row">
                      <Link to={`/homework/${a.id}`} className="hw-title">
                        {a.title || 'Untitled'}
                      </Link>
                      <span className={'small nowrap ' + (overdue ? 'hw-overdue' : 'muted')}>
                        {overdue ? 'Overdue · ' : ''}
                        {a.dueDate ? relativeDay(a.dueDate, today) : 'No due date'}
                        {a.dueTime ? `, ${formatTime(a.dueTime, clock)}` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="muted small hw-foot">
                {hw.open.length > 8 && (
                  <>
                    <Link to="/homework">{hw.open.length - 8} more</Link> ·{' '}
                  </>
                )}
                {hw.done} done
              </p>
            </>
          )}
        </Card>

        {hasTeacher && (
          <Card title="Teacher">
            <dl className="kv">
              {t.name && (
                <>
                  <dt>Name</dt>
                  <dd>{t.name}</dd>
                </>
              )}
              {t.email && (
                <>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${t.email}`}>{t.email}</a>
                  </dd>
                </>
              )}
              {t.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>
                    <ExtLink href={telHref(t.phone)}>{t.phone}</ExtLink>
                  </dd>
                </>
              )}
              {t.website && (
                <>
                  <dt>Website</dt>
                  <dd>
                    <ExtLink href={safeHref(t.website)}>{hostOf(t.website)}</ExtLink>
                  </dd>
                </>
              )}
              {t.office && (
                <>
                  <dt>Office</dt>
                  <dd>
                    {t.office}
                    {officeRoom && (
                      <>
                        {' · '}
                        <Link to={`/map?from=entrance&to=${encodeURIComponent(officeRoom.key)}`}>Directions</Link>
                      </>
                    )}
                  </dd>
                </>
              )}
              {t.officeHours && (
                <>
                  <dt>Extra help</dt>
                  <dd>
                    <Pre>{t.officeHours}</Pre>
                  </dd>
                </>
              )}
            </dl>
          </Card>
        )}

        {cls.links.length > 0 && (
          <Card title="Links">
            <ul className="list link-list">
              {cls.links.map((l, i) => {
                const href = safeHref(l.url);
                return (
                  <li key={i}>
                    <ExtLink href={href}>{l.label || hostOf(l.url)}</ExtLink>
                    {l.label && <span className="muted small"> · {hostOf(l.url)}</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {hasCourse && (
          <Card title="Course details">
            <dl className="kv">
              {cls.grade && (
                <>
                  <dt>Current grade</dt>
                  <dd className="grade">{cls.grade}</dd>
                </>
              )}
              {cls.materials && (
                <>
                  <dt>Materials</dt>
                  <dd>
                    <Pre>{cls.materials}</Pre>
                  </dd>
                </>
              )}
              {cls.gradingPolicy && (
                <>
                  <dt>Grading</dt>
                  <dd>
                    <Pre>{cls.gradingPolicy}</Pre>
                  </dd>
                </>
              )}
            </dl>
          </Card>
        )}

        {cls.notes && (
          <Card title="Notes">
            <Pre>{cls.notes}</Pre>
          </Card>
        )}

        {cls.customFields.length > 0 && (
          <Card title="More details">
            <dl className="kv">
              {cls.customFields.map((f, i) => (
                <Fragment key={i}>
                  <dt>{f.key}</dt>
                  <dd>{/^https?:\/\/\S+$/.test(f.value) ? <ExtLink href={safeHref(f.value)}>{f.value}</ExtLink> : <Pre>{f.value || '—'}</Pre>}</dd>
                </Fragment>
              ))}
            </dl>
          </Card>
        )}
      </div>

      {missing.length > 0 && (
        <p className="muted small">
          You can also add {missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}.{' '}
          <Link to={`/classes/${cls.id}/edit`} state={editState}>
            Edit class
          </Link>
        </p>
      )}

      <div className="detail-actions">
        <Button onClick={duplicate} disabled={busy}>
          Duplicate
        </Button>
        <Button onClick={toggleArchive} disabled={busy}>
          {cls.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button variant="danger" onClick={() => setDeleting(true)} disabled={busy}>
          Delete
        </Button>
        <span className="spacer" />
        <span className="muted small">
          Added {formatDate(todayISO(new Date(cls.createdAt)), { weekday: false })}
          {cls.updatedAt - cls.createdAt > 60000 ? ` · edited ${formatDate(todayISO(new Date(cls.updatedAt)), { weekday: false })}` : ''}
        </span>
      </div>

      <DeleteClassDialog cls={cls} open={deleting} onClose={() => setDeleting(false)} onDeleting={onLeaving} onDeleted={() => navigate('/classes', { replace: true })} />
    </Page>
  );
}
