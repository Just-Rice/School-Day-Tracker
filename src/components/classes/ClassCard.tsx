import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ClassInfo, SchoolSchedule } from '../../types';
import { LEVEL_COLORS, TERM_LABELS, meetingSummary, roomLabel } from '../../lib/classes';
import { Chip } from '../ui';
import ClassIcon from './ClassIcon';

/** A class in the list: color bar, icon, name, level, period(s), room and teacher. */
export default function ClassCard({ cls, schedule, openCount }: { cls: ClassInfo; schedule: SchoolSchedule | null; openCount: number }) {
  const when = meetingSummary(cls, schedule);
  const room = roomLabel(cls.room);
  const hasAlt = (cls.altRooms?.length ?? 0) > 0;
  return (
    <Link to={`/classes/${cls.id}`} className={'class-card' + (cls.archived ? ' is-archived' : '')} style={{ '--cls': cls.color } as CSSProperties}>
      <ClassIcon cls={cls} size={44} />
      <div className="class-card-main">
        <div className="class-card-title">
          <h2>{cls.name || 'Untitled class'}</h2>
          {cls.level && <Chip color={LEVEL_COLORS[cls.level]}>{cls.level}</Chip>}
          {cls.term && cls.term !== 'full' && <Chip title={TERM_LABELS[cls.term]}>{cls.term}</Chip>}
          {cls.archived && <Chip>Archived</Chip>}
        </div>
        <ul className="class-card-facts">
          <li className={when ? undefined : 'muted'}>
            <span className="sr-only">When: </span>
            {when || 'No period yet'}
          </li>
          {room && (
            <li>
              <span className="sr-only">Room: </span>
              {room}
              {hasAlt && <span className="muted"> +{cls.altRooms!.length}</span>}
            </li>
          )}
          {cls.teacher.name && (
            <li>
              <span className="sr-only">Teacher: </span>
              {cls.teacher.name}
            </li>
          )}
        </ul>
      </div>
      {openCount > 0 && (
        <span className="badge class-card-badge" title={`${openCount} unfinished assignment${openCount === 1 ? '' : 's'}`}>
          {openCount}
          <span className="sr-only"> unfinished assignment{openCount === 1 ? '' : 's'}</span>
        </span>
      )}
    </Link>
  );
}
