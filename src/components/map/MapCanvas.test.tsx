import fs from 'node:fs';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRoom, SchoolMapData } from '../../types';
import { toMap } from '../../lib/directions';
import { buildRooms } from '../../lib/mapData';
import { createNavGrid, routeFromEntrance } from '../../lib/nav';
import MapCanvas from './MapCanvas';

const data: SchoolMapData = JSON.parse(fs.readFileSync('public/schools/hsn/map.json', 'utf8'));
const rooms = buildRooms(data);
const room = (key: string) => rooms.find((r) => r.key === key)!;

// jsdom has no PointerEvent (or layout)
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

function renderMap(onPickRoom: (r: MapRoom | null) => void, to: MapRoom) {
  const route = routeFromEntrance(createNavGrid(data), data, to);
  const { container } = render(
    <MapCanvas
      data={data}
      rooms={rooms}
      level={0}
      orientation="north-up-xz"
      northDeg={0}
      label="HSN map, 1st floor"
      floorNames={['1st floor', '2nd floor']}
      selected={to}
      route={route}
      highlights={[]}
      focus={{ id: 0, box: null }}
      onPickRoom={onPickRoom}
      onLevel={() => {}}
    />,
  );
  const canvas = container.querySelector<HTMLElement>('.mp-canvas')!;
  const view = () => {
    const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(container.querySelector('.mp-svg > g')!.getAttribute('transform')!)!;
    return { tx: +m[1], ty: +m[2], k: +m[3] };
  };
  /** screen point of a room's middle */
  const at = (r: MapRoom) => {
    const [u, v] = toMap('north-up-xz', (r.R[0] + r.R[2]) / 2, (r.R[1] + r.R[3]) / 2);
    const { tx, ty, k } = view();
    return { clientX: tx + u * k, clientY: ty + v * k };
  };
  const press = (p: { clientX: number; clientY: number }) => {
    fireEvent(canvas, new FakePointerEvent('pointerdown', { ...p, button: 0 }));
    fireEvent(canvas, new FakePointerEvent('pointerup', { ...p, button: 0 }));
  };
  return { canvas, view, at, press };
}

describe('MapCanvas taps', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('picks the room that was tapped', () => {
    const onPick = vi.fn();
    const m = renderMap(onPick, room('A103'));
    m.press(m.at(room('A104')));
    act(() => vi.advanceTimersByTime(300));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(room('A104'));
  });

  it('zooms on a double-click without replacing the destination', () => {
    const onPick = vi.fn();
    const m = renderMap(onPick, room('A103'));
    const k = m.view().k;
    const p = m.at(room('A104'));
    m.press(p);
    act(() => vi.advanceTimersByTime(120));
    m.press(p);
    fireEvent.dblClick(m.canvas, p);
    act(() => vi.advanceTimersByTime(1000));
    expect(onPick).not.toHaveBeenCalled();
    expect(m.view().k).toBeCloseTo(k * 2);
  });
});
