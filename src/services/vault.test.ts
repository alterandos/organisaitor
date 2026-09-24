// Port of the "21 checks" Node harness (CLAUDE.md "Client-side encryption for Notes —
// comprehensive") into a permanent Vitest file. `fake-indexeddb/auto` polyfills the global
// indexedDB the "trust this device" cache needs — btoa/atob/crypto.subtle are native in Node 22.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeVaultTable = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    reset: () => rows.clear(),
    from: (table: string) => {
      if (table !== 'user_vault') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, userId: string) => ({
            maybeSingle: (): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> =>
              Promise.resolve({ data: rows.get(userId) ?? null, error: null }),
          }),
        }),
        upsert: (row: Record<string, unknown>) => {
          rows.set(row.user_id as string, row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
});

vi.mock('@/services/supabase', () => ({ supabase: { from: (t: string) => fakeVaultTable.from(t) } }));

const {
  setupVault, unlockWithPassphrase, unlockWithRecoveryCode, verifyVaultSecret, lockVault,
  checkVaultStatus, retryVaultCheck, resetVaultModuleState, registerBeforeLock,
  trustThisDevice, untrustThisDevice, encryptField, decryptField, onVaultStatus, isVaultUnlocked, getVaultError,
} = await import('@/services/vault');

const USER = 'user-vault-1';

beforeEach(() => {
  fakeVaultTable.reset();
  resetVaultModuleState();
});

describe('setupVault / unlockWithPassphrase', () => {
  it('sets up a vault, ends unlocked, and can encrypt/decrypt immediately', async () => {
    await setupVault(USER, 'correct horse battery staple');
    expect(isVaultUnlocked()).toBe(true);
    const cipher = await encryptField('secret text');
    expect(await decryptField(cipher)).toBe('secret text');
  });

  it('returns a usable recovery code exactly once, that unlocks a freshly-locked vault', async () => {
    const { recoveryCode } = await setupVault(USER, 'my passphrase');
    await lockVault();
    expect(isVaultUnlocked()).toBe(false);
    expect(await unlockWithRecoveryCode(recoveryCode)).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  it('the recovery code check is case- and whitespace-insensitive', async () => {
    const { recoveryCode } = await setupVault(USER, 'pw');
    await lockVault();
    const messy = `  ${recoveryCode.toLowerCase()}  `;
    expect(await unlockWithRecoveryCode(messy)).toBe(true);
  });

  it('a wrong passphrase is rejected without changing lock state', async () => {
    await setupVault(USER, 'right passphrase');
    await lockVault();
    expect(await unlockWithPassphrase('wrong passphrase')).toBe(false);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('a wrong recovery code is rejected', async () => {
    await setupVault(USER, 'pw');
    await lockVault();
    expect(await unlockWithRecoveryCode('0000-0000-0000-0000')).toBe(false);
  });
});

describe('verifyVaultSecret — checks without changing lock state', () => {
  it('confirms the right passphrase/recovery code while STAYING unlocked', async () => {
    const { recoveryCode } = await setupVault(USER, 'my passphrase');
    expect(await verifyVaultSecret('my passphrase', 'passphrase')).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
    expect(await verifyVaultSecret(recoveryCode, 'recovery')).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  it('rejects a wrong secret without changing lock state either way', async () => {
    await setupVault(USER, 'my passphrase');
    expect(await verifyVaultSecret('nope', 'passphrase')).toBe(false);
    expect(isVaultUnlocked()).toBe(true); // still unlocked — verify never locks
  });

  it('returns false with no vault set up at all (no cachedRow to check against)', async () => {
    expect(await verifyVaultSecret('anything', 'passphrase')).toBe(false);
  });
});

describe('lockVault — flushes pending work before dropping the key', () => {
  it('runs every "flush" hook, then every "settle" hook, before the vault reports locked', async () => {
    await setupVault(USER, 'pw');
    const order: string[] = [];
    registerBeforeLock(() => { order.push('flush'); }, 'flush');
    registerBeforeLock(async () => { order.push('settle'); }, 'settle');

    await lockVault();
    expect(order).toEqual(['flush', 'settle']);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('a throwing hook does not stop the lock, or the other hooks, from proceeding', async () => {
    await setupVault(USER, 'pw');
    const ran: string[] = [];
    registerBeforeLock(() => { throw new Error('boom'); });
    registerBeforeLock(() => { ran.push('second'); });

    await lockVault();
    expect(ran).toEqual(['second']);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('locking an already-locked vault is a no-op (does not re-run hooks)', async () => {
    await setupVault(USER, 'pw');
    await lockVault();
    let calls = 0;
    registerBeforeLock(() => { calls++; });
    await lockVault();
    expect(calls).toBe(0);
  });
});

describe('encryptField / decryptField', () => {
  it('round-trips arbitrary text, with a fresh IV each time (ciphertext differs for the same plaintext)', async () => {
    await setupVault(USER, 'pw');
    const a = await encryptField('same text');
    const b = await encryptField('same text');
    expect(a).not.toBe(b);
    expect(await decryptField(a)).toBe('same text');
    expect(await decryptField(b)).toBe('same text');
  });

  it('both reject while the vault is locked', async () => {
    await setupVault(USER, 'pw');
    const cipher = await encryptField('x');
    await lockVault();
    await expect(encryptField('y')).rejects.toThrow(/locked/i);
    await expect(decryptField(cipher)).rejects.toThrow(/locked/i);
  });
});

describe('checkVaultStatus', () => {
  it('reports "not-set-up" for an account with no vault row', async () => {
    await checkVaultStatus('someone-else');
    const statuses: string[] = [];
    const unsub = onVaultStatus((s) => statuses.push(s));
    unsub();
    expect(statuses).toEqual(['not-set-up']);
  });

  it('reports "locked" for an account with a vault but no trusted-device key on this device', async () => {
    await setupVault(USER, 'pw');
    resetVaultModuleState(); // simulate a fresh page load — nothing in memory, vault row still in "Supabase"
    await checkVaultStatus(USER);
    expect(isVaultUnlocked()).toBe(false);
    let last = '';
    const unsub = onVaultStatus((s) => { last = s; });
    unsub();
    expect(last).toBe('locked');
  });

  it('auto-unlocks via trustThisDevice\'s cached key on the next check', async () => {
    await setupVault(USER, 'pw');
    await trustThisDevice(USER);
    resetVaultModuleState();
    await checkVaultStatus(USER);
    expect(isVaultUnlocked()).toBe(true);
  });

  it('untrustThisDevice makes the next check fall back to "locked"', async () => {
    await setupVault(USER, 'pw');
    await trustThisDevice(USER);
    await untrustThisDevice(USER);
    resetVaultModuleState();
    await checkVaultStatus(USER);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('a manual lock is sticky across a re-check (does not silently auto-unlock again)', async () => {
    await setupVault(USER, 'pw');
    await trustThisDevice(USER);
    await lockVault(); // untrusts the device too, but simulate the re-fire happening before that lands elsewhere
    await checkVaultStatus(USER);
    expect(isVaultUnlocked()).toBe(false);
  });

  it('surfaces a failed read as "unavailable" with the error recorded, not "not-set-up" or "locked"', async () => {
    const original = fakeVaultTable.from;
    fakeVaultTable.from = () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'network down' } }) }) }),
      upsert: original('user_vault').upsert,
    });
    await checkVaultStatus(USER);
    expect(isVaultUnlocked()).toBe(false);
    expect(getVaultError()).toMatch(/network down/);
    fakeVaultTable.from = original;
  });

  it('retryVaultCheck flips to "unknown" first, then re-runs the check', async () => {
    await setupVault(USER, 'pw');
    resetVaultModuleState();
    const seen: string[] = [];
    const unsub = onVaultStatus((s) => seen.push(s));
    await retryVaultCheck(USER);
    unsub();
    expect(seen[0]).toBe('unknown');
    expect(seen[seen.length - 1]).toBe('locked');
  });
});
