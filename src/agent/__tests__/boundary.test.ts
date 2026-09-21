import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const commandsDir = path.resolve(import.meta.dirname, '../commands');

async function lint(code: string, file: string) {
  const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../../..') });
  const [result] = await eslint.lintText(code, { filePath: path.join(commandsDir, file) });
  return result.messages.filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports');
}

describe('the agent boundary', () => {
  it('lets a command import types and pure utils', async () => {
    const code = "import type { Task } from '@/store/taskStore';\nimport { addDaysToIso } from '@/utils/date';\nexport const x = addDaysToIso;\nexport type T = Task;\n";
    expect(await lint(code, 'probe.ts')).toEqual([]);
  });

  it.each([
    ["import { useTaskStore } from '@/store/taskStore';", 'a store'],
    ["import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';", 'a service'],
    ["import { searchQuickAccessItems } from '@/utils/quickAccess';", 'quick access'],
    ["import { revertChanges } from '@/agent/batch';", 'the revert engine'],
  ])('rejects a command importing %s', async (line) => {
    const messages = await lint(`${line}\nexport const x = 1;\n`, 'probe.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/@\/agent\/access/);
  });

  it('is satisfied by every real command file', () => {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) {
      const source = readFileSync(path.join(commandsDir, f), 'utf8');
      expect(source, f).not.toMatch(/from '@\/(store|services)\//);
    }
  });
});
