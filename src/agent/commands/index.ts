import type { CommandDef } from '@/agent/types';
import { READ_COMMANDS } from './read';
import { TASK_COMMANDS } from './tasks';
import { CALENDAR_COMMANDS } from './calendar';
import { SCHEDULE_COMMANDS } from './schedules';
import { ORGANISATION_COMMANDS } from './organisation';

export const ALL_COMMANDS: CommandDef[] = [
  ...READ_COMMANDS,
  ...TASK_COMMANDS,
  ...CALENDAR_COMMANDS,
  ...SCHEDULE_COMMANDS,
  ...ORGANISATION_COMMANDS,
];
