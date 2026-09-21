import { z } from 'zod';
import { ALL_COMMANDS } from '@/agent/commands';
import type { CommandDef, ToolDefinition } from '@/agent/types';

const byName = new Map<string, CommandDef>(ALL_COMMANDS.map((c) => [c.name, c]));

export const getCommand = (name: string): CommandDef | undefined => byName.get(name);

export const listCommands = (): CommandDef[] => ALL_COMMANDS;

// What is sent to a model API as its tool list. `io: 'input'` keeps fields that have a default
// optional, which is what the model should see.
export function toolDefinitions(): ToolDefinition[] {
  return ALL_COMMANDS.map((c) => {
    const schema = z.toJSONSchema(c.input, { io: 'input' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: c.name, description: c.description, input_schema: schema };
  });
}
