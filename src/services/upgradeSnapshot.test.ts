// A safety snapshot before every store migration (docs/features/endeavours.md "Reversibility").
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { recordFirstRead } from '@/utils/persistFirstRead';
import { takeUpgradeSnapshot, UPGRADE_SNAPSHOTS_KEPT } from './upgradeSnapshot';
import { listBackupSnapshots, getBackupSnapshot } from './autoBackupStorage';

const stored = (state: unknown, version: number) => JSON.stringify({ state, version });

describe('takeUpgradeSnapshot', () => {
  it('keeps a store\'s data from before its version changed, and nothing when none changed', async () => {
    localStorage.setItem('todo-settings', stored({ theme: 'dark' }, 2));
    recordFirstRead('todo-settings', stored({ theme: 'dark' }, 2));
    expect(await takeUpgradeSnapshot()).toEqual([]);

    recordFirstRead('todo-settings', stored({ theme: 'dark', old: true }, 1));
    localStorage.setItem('todo-settings', stored({ theme: 'dark' }, 2));
    expect(await takeUpgradeSnapshot()).toEqual(['todo-settings']);
    const [latest] = (await listBackupSnapshots()).filter((s) => s.kind === 'upgrade');
    const data = JSON.parse((await getBackupSnapshot(latest.id))!);
    expect(data['todo-settings']).toEqual({ state: { theme: 'dark', old: true }, version: 1 });
    expect(data.upgraded).toEqual(['todo-settings']);
  });

  it('keeps only the last few', async () => {
    for (let i = 0; i < UPGRADE_SNAPSHOTS_KEPT + 2; i++) {
      recordFirstRead('todo-settings', stored({ i }, 1));
      localStorage.setItem('todo-settings', stored({ i }, 2));
      await takeUpgradeSnapshot();
    }
    expect((await listBackupSnapshots()).filter((s) => s.kind === 'upgrade')).toHaveLength(UPGRADE_SNAPSHOTS_KEPT);
  });
});
