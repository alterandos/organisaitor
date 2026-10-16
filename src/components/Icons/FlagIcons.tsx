import type { SVGProps } from 'react';
import { Icon } from './ActionIcons';
import { UNSURE_ICON_PATHS, UNSURE_RING } from './unsureIcon';

// The Unsure flag: a question mark in a broken ring (unsureIcon.ts, shared with plain-DOM code).
// The file is FlagIcons, not UnsureIcon: that would clash with unsureIcon.ts on a case-insensitive
// disk.
export function UnsureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx={UNSURE_RING.cx} cy={UNSURE_RING.cy} r={UNSURE_RING.r} strokeDasharray={UNSURE_RING.dash} />
      {UNSURE_ICON_PATHS.map((d) => <path key={d} d={d} />)}
    </Icon>
  );
}
