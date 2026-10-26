import { useEffect, useState } from 'react';
import { onVaultStatus, isVaultUnlocked, type VaultStatus } from '@/services/vault';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { scopeContext, waitingForEncryption } from '@/services/encryption/kinds';
import { encryptAllWaiting } from '@/services/encryption/enforcer';
import type { ScopeContext } from '@/utils/encryptionScopes';
import { LABELS } from '@/config/labels';
import { log } from '@/utils/log';
import styles from './EncryptContentsField.module.css';

// Encryption by scope: the "encrypt everything in it" switch on a notebook or an Endeavour
// (CLAUDE.md "Encryption by scope"). It applies at once, asking first: turning it on says how many
// notes and lists will be encrypted now and needs the vault unlocked; turning it off leaves what's
// already encrypted as it is. A new scope uses this field with its own `withFlag`.
export function EncryptContentsField({ label, hint, value, inheritedFrom, withFlag, onChange }: {
  label: string;
  hint: string;
  value: boolean;
  // The notebook above whose setting already covers this one, if any.
  inheritedFrom?: string | null;
  // The scope context as it would be with this scope's setting on, to count what it would cover.
  withFlag: (ctx: ScopeContext) => ScopeContext;
  onChange: (next: boolean) => void;
}) {
  const [status, setStatus] = useState<VaultStatus>(() => (isVaultUnlocked() ? 'unlocked' : 'unknown'));
  const [busy, setBusy] = useState(false);
  useEffect(() => onVaultStatus(setStatus), []);

  const unlocked = status === 'unlocked';
  const checked = value || !!inheritedFrom;
  const disabled = busy || !!inheritedFrom || (!value && !unlocked);

  async function toggle() {
    if (disabled) return;
    if (value) {
      const ok = await confirmDialog({
        title: LABELS.encryptionScope.offTitle,
        message: LABELS.encryptionScope.offMessage,
        confirmLabel: LABELS.encryptionScope.offConfirm,
      });
      if (ok) onChange(false);
      return;
    }
    const now = scopeContext();
    const already = new Set(waitingForEncryption(now).map((w) => `${w.kind}:${w.id}`));
    const added = waitingForEncryption(withFlag(now)).filter((w) => !already.has(`${w.kind}:${w.id}`));
    const ok = await confirmDialog({
      title: LABELS.encryptionScope.onTitle,
      message: LABELS.encryptionScope.onMessage(added.filter((w) => w.kind === 'note').length, added.filter((w) => w.kind === 'list').length),
      confirmLabel: LABELS.encryptionScope.onConfirm,
    });
    if (!ok) return;
    onChange(true);
    setBusy(true);
    try {
      await encryptAllWaiting();
    } catch (err) {
      log.error('encryption', 'encrypting a scope failed', err);
    } finally {
      setBusy(false);
    }
  }

  const note = inheritedFrom
    ? LABELS.encryptionScope.inherited(inheritedFrom)
    : !value && !unlocked
      ? (status === 'not-set-up' ? LABELS.encryptionScope.notSetUp : LABELS.encryptionScope.unlockFirst)
      : hint;

  return (
    <div className={styles.field}>
      <label className={styles.row}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => { void toggle(); }} />
        <span className={styles.label}>🔒 {label}</span>
      </label>
      <p className={styles.hint}>{note}</p>
    </div>
  );
}
