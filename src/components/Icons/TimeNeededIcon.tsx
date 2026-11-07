import type { SVGProps } from 'react';

// How much time a task needs, as a clock (the user, 2026-11-06/07): a face filled clockwise from
// twelve, the way the hands sweep, a third (twelve to four), two thirds (twelve to eight) or all of
// it; 0 is the empty face, "not set". Drawn as a clock: a rim, hour marks at 12, 3, 6 and 9, a
// minute hand on twelve and an hour hand where the fill ends, and the pin in the middle. The fill
// is a tint of the current colour so the hands and marks read over it; the field colours each level.
const C = 8, R = 6.5, FILL_R = 5.6;
const point = (turn: number, r: number) => {
  const a = turn * 2 * Math.PI;
  return { x: +(C + r * Math.sin(a)).toFixed(2), y: +(C - r * Math.cos(a)).toFixed(2) };
};
const sector = (turn: number) => {
  const end = point(turn, FILL_R);
  return `M${C} ${C} L${C} ${C - FILL_R} A${FILL_R} ${FILL_R} 0 ${turn > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
};
// Where the hour hand points: the fill's end; on the empty face, three o'clock.
const HOUR_TURN = [0.25, 1 / 3, 2 / 3, 0];

export function TimeNeededIcon({ level, ...props }: { level: 0 | 1 | 2 | 3 } & SVGProps<SVGSVGElement>) {
  const hour = point(HOUR_TURN[level], 3.4);
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" aria-hidden="true" {...props}>
      {level === 3 ? <circle cx={C} cy={C} r={FILL_R} fill="currentColor" fillOpacity="0.4" />
        : level > 0 && <path d={sector(level / 3)} fill="currentColor" fillOpacity="0.4" />}
      <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth="1.3" />
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        {[0, 0.25, 0.5, 0.75].map((t) => {
          const a = point(t, R - 0.9), b = point(t, R - 2);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </g>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1={C} y1={C} x2={C} y2={C - 4.4} />
        <line x1={C} y1={C} x2={hour.x} y2={hour.y} />
      </g>
      <circle cx={C} cy={C} r="0.9" fill="currentColor" />
    </svg>
  );
}
