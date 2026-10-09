import type { Profile } from '../../types';
import { useData } from '../../data/DataProvider';
import { formatTime } from '../../lib/dates';
import { Card } from '../ui';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="acct-setting">
      <span className="field-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="segmented acct-segmented" role="group" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => value !== o.id && onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AppearanceCard() {
  const { profile, saveProfile } = useData();
  const save = (p: Partial<Profile>) => void saveProfile(p).catch(() => {});
  return (
    <Card title="Appearance" className="acct-card">
      <div className="stack acct-sections">
        <Segmented<Profile['theme']>
          label="Theme"
          value={profile.theme}
          onChange={(theme) => save({ theme })}
          options={[
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
        />
        <Segmented<Profile['clock']>
          label="Clock"
          value={profile.clock}
          onChange={(clock) => save({ clock })}
          options={[
            { id: '12h', label: `12-hour (${formatTime('13:05', '12h')})` },
            { id: '24h', label: `24-hour (${formatTime('13:05', '24h')})` },
          ]}
        />
      </div>
    </Card>
  );
}
