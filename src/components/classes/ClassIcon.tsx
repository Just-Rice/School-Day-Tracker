import type { CSSProperties } from 'react';
import type { ClassInfo } from '../../types';

const SKIP = /^(ap|h|honors|cp|acc|accelerated|i{1,3}|iv|v|\d+|&|and|of|the)$/i;

/** 'AP Chemistry' -> 'Ch', 'US History' -> 'UH' */
export function initials(name: string): string {
  const words = name.split(/[\s/-]+/).filter((w) => w && !SKIP.test(w));
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase() || '?';
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (ch) => ch.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The class's emoji (or initials) on a tile tinted with its color. */
export default function ClassIcon({ cls, size = 40 }: { cls: Pick<ClassInfo, 'icon' | 'name' | 'color'>; size?: number }) {
  const icon = cls.icon?.trim();
  const style = { '--cls': cls.color, width: size, height: size, fontSize: Math.round(size * (icon ? 0.52 : 0.38)) } as CSSProperties;
  return (
    <span className={'cls-icon' + (icon ? '' : ' cls-icon-text')} style={style} aria-hidden>
      {icon || initials(cls.name)}
    </span>
  );
}
