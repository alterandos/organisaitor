import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const commandsDir = path.resolve(import.meta.dirname, '../commands');

// One ESLint instance for the whole file, not one per case — each instantiation resolves the
// flat config and the TypeScript project fresh, which is expensive enough (as the codebase has
// grown) that 5 of them under worker-pool contention could exceed the default per-test timeout,
// intermittently failing a test that isn't actually broken. Reused, cold-start cost is paid once.
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../../..') });

async function lint(code: string, file: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(commandsDir, file) });
  return result.messages.filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports');
}

describe('the agent boundary', () => {
  // Generous timeouts on the ESLint-backed cases only: the FIRST call to `eslint.lintText()`
  // pays a real, unavoidable cold-start cost (resolving the flat config and the TypeScript
  // project service), which can exceed the default 5s under worker-pool contention when the
  // full suite runs — not a hang, just slow I/O-bound setup paid once per file.
  it('lets a command import types and pure utils', async () => {
    const code = "import type { Task } from '@/store/taskStore';\nimport { addDaysToIso } from '@/utils/date';\nexport const x = addDaysToIso;\nexport type T = Task;\n";
    expect(await lint(code, 'probe.ts')).toEqual([]);
  }, 20_000);

  it.each([
    ["import { useTaskStore } from '@/store/taskStore';", 'a store'],
    ["import { deleteTaskWithCleanup } from '@/services/crossAppLinkCleanup';", 'a service'],
    ["import { searchQuickAccessItems } from '@/utils/quickAccess';", 'quick access'],
    ["import { revertChanges } from '@/agent/batch';", 'the revert engine'],
  ])('rejects a command importing %s', async (line) => {
    const messages = await lint(`${line}\nexport const x = 1;\n`, 'probe.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toMatch(/@\/agent\/access/);
  }, 20_000);

  it('is satisfied by every real command file', () => {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) {
      const source = readFileSync(path.join(commandsDir, f), 'utf8');
      expect(source, f).not.toMatch(/from '@\/(store|services)\//);
    }
  });
});
