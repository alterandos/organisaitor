import { datedObjectKind } from './datedKindFactory';

// `\reminder call mum tomorrow 5pm` — see datedKindFactory.ts (shared with Deadline).
export const reminderKind = datedObjectKind('reminder', ['rem', 'remind', 'r']);
