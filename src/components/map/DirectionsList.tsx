// The written directions for a route: total distance and time, then one row per step. Tapping a
// step shows that spot on the map (switching floors when it's on the other one).
import type { DirectionStep, Directions } from '../../lib/directions';
import { formatDistance } from '../../lib/directions';

function stepIcon(s: DirectionStep): string {
  switch (s.kind) {
    case 'start':
      return '●';
    case 'arrive':
      return '⚑';
    case 'stairs':
      return /\bup\b/.test(s.text) ? '↗' : '↘';
    case 'turn':
      if (/turn around/i.test(s.text)) return '↶';
      return /\bleft\b/.test(s.text) ? '↰' : '↱';
    default:
      return '↑';
  }
}

export default function DirectionsList({ directions, floorNames, onStep }: { directions: Directions; floorNames: string[]; onStep(step: DirectionStep): void }) {
  const { steps, totalMeters, minutes } = directions;
  let lastLevel = steps[0]?.level ?? 0;
  return (
    <div className="mp-dirs">
      <p className="mp-dirs-summary">
        <strong>
          {minutes} min walk
        </strong>
        <span className="muted"> · {formatDistance(totalMeters)}</span>
      </p>
      <ol className="mp-steps">
        {steps.map((s, i) => {
          const floorChange = s.level !== lastLevel;
          lastLevel = s.level;
          return (
            <li key={i} className={`mp-step k-${s.kind}`}>
              {floorChange && <div className="mp-step-floor">{floorNames[s.level] ?? `Floor ${s.level + 1}`}</div>}
              <button type="button" className="mp-step-btn" onClick={() => onStep(s)}>
                <span className="mp-step-icon" aria-hidden>
                  {stepIcon(s)}
                </span>
                <span className="mp-step-text">{s.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
