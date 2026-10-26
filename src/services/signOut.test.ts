import { beforeEach, describe, expect, it, vi } from 'vitest';

// requestSignOut and encryption by scope: anything an encrypted notebook or Endeavour covers that
// isn't encrypted yet was never uploaded, so it's encrypted before the vault locks, or the person is
// warned (Cancel keeps them signed in, nothing lost).

const m = vi.hoisted(() => ({
  calls: [] as string[],
  waiting: 0,
  answers: [] as boolean[],
  signOut: vi.fn(async () => { m.calls.push('signOut'); }),
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' }, signOut: m.signOut }) } }));
vi.mock('@/services/sync/syncService', () => ({ forceUpload: async () => { m.calls.push('upload'); } }));
vi.mock('@/services/vault', () => ({
  lockVault: async () => { m.calls.push('lock'); },
  untrustThisDevice: async () => {},
}));
vi.mock('@/services/encryption/enforcer', () => ({ encryptAllWaiting: async () => { m.calls.push('encrypt'); return m.waiting; } }));
vi.mock('@/services/welcome', () => ({ resetWelcome: () => {} }));
vi.mock('@/components/ConfirmDialog/dialogs', () => ({
  confirmDialog: async (o: { title: string }) => { m.calls.push(`ask:${o.title}`); return m.answers.shift() ?? true; },
}));

const { requestSignOut } = await import('./signOut');
const { LABELS } = await import('@/config/labels');

beforeEach(() => { m.calls.length = 0; m.waiting = 0; m.answers = []; });

describe('sign-out and encryption by scope', () => {
  it('encrypts what’s waiting before locking the vault, then signs out', async () => {
    expect(await requestSignOut()).toBe(true);
    expect(m.calls).toEqual([`ask:${LABELS.signOut.title}`, 'encrypt', 'lock', 'upload', 'signOut']);
  });

  it('if something couldn’t be encrypted, asks; Cancel keeps the person signed in and the vault open', async () => {
    m.waiting = 2;
    m.answers = [true, false];
    expect(await requestSignOut()).toBe(false);
    expect(m.calls).toEqual([`ask:${LABELS.signOut.title}`, 'encrypt', `ask:${LABELS.signOut.waitingTitle}`]);
  });

  it('choosing to remove them signs out', async () => {
    m.waiting = 1;
    m.answers = [true, true];
    expect(await requestSignOut()).toBe(true);
    expect(m.calls.at(-1)).toBe('signOut');
  });
});
