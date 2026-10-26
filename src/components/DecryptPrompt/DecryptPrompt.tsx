import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import {
  onVaultStatus, verifyVaultSecret, unlockWithPassphrase, unlockWithRecoveryCode, type VaultStatus,
} from '@/services/vault';
import type { NoteId } from '@/types/notes';
import type { ListId } from '@/types/lists';
import styles from './DecryptPrompt.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { CloseIcon } from '@/components/Icons';
import { useTaskStore } from '@/store/taskStore';
import { LABELS } from '@/config/labels';
import { listScopes, noteScopes } from '@/utils/encryptionScopes';

// "Enter your passphrase to permanently decrypt this note/list." Opened by the clickable 🔒
// icons (uiStore.requestDecrypt). Deliberately asks for the passphrase (or recovery code) even
// when the vault is already unlocked: removing encryption is the one action that puts sensitive
// content back in the cloud in plaintext, so it shouldn't be a single stray click. If the vault
// is locked, entering the secret also unlocks it (verify + unlock are the same step).
export function DecryptPrompt() {
  const prompt = useUIStore((s) => s.decryptPrompt);
  const close  = useUIStore((s) => s.closeDecryptPrompt);

  const [status, setStatus] = useState<VaultStatus>('unknown');
  const [mode, setMode]     = useState<'passphrase' | 'recovery'>('passphrase');
  const [value, setValue]   = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => onVaultStatus(setStatus), []);

  // Encryption by scope: an item a notebook or Endeavour keeps encrypted can't lose its encryption
  // on its own (the enforcer would only encrypt it again).
  const notes       = useNoteStore((s) => s.notes);
  const noteTags    = useNoteStore((s) => s.noteTags);
  const lists       = useListStore((s) => s.lists);
  const collections = useTaskStore((s) => s.collections);

  useEscapeClose(close);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!prompt) return null;
  const noun = prompt.kind === 'note' ? 'note' : 'list';
  const ctx = { noteTags, collections };
  const note = prompt.kind === 'note' ? notes[prompt.id as NoteId] : undefined;
  const list = prompt.kind === 'list' ? lists[prompt.id as ListId] : undefined;
  const keptBy = note ? noteScopes(note, ctx) : list ? listScopes(list, ctx) : [];
  if (keptBy.length > 0) {
    const where = keptBy.map((sc) => LABELS.encryptionScope.scopeName(sc.kind, sc.name, LABELS.collection)).join(' and ');
    return createPortal(
      <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className={styles.modal} role="dialog" aria-label={LABELS.encryptionScope.cantRemoveTitle}>
          <div className={styles.header}>
            <span className={styles.title}>🔒 {LABELS.encryptionScope.cantRemoveTitle}</span>
            <button className={styles.closeBtn} type="button" onClick={close} aria-label="Close"><CloseIcon /></button>
          </div>
          <div className={styles.body}>
            <p className={styles.text}>{LABELS.encryptionScope.cantRemove(where)}</p>
            <div className={styles.actions}>
              <button className={styles.submitBtn} type="button" onClick={close} autoFocus>OK</button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  const usable = status === 'locked' || status === 'unlocked';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value || busy) return;
    setError(null);
    setBusy(true);
    try {
      const ok = status === 'unlocked'
        ? await verifyVaultSecret(value, mode)
        : mode === 'passphrase' ? await unlockWithPassphrase(value) : await unlockWithRecoveryCode(value);
      if (!ok) { setError(mode === 'passphrase' ? 'Incorrect passphrase.' : 'Incorrect recovery code.'); return; }
      if (prompt.kind === 'note') await useNoteStore.getState().decryptNote(prompt.id as NoteId);
      else await useListStore.getState().decryptList(prompt.id as ListId);
      setValue('');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not decrypt this ${noun}.`);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.modal} role="dialog" aria-label={`Decrypt ${noun}`}>
        <div className={styles.header}>
          <span className={styles.title}>🔒 Decrypt this {noun}?</span>
          <button className={styles.closeBtn} type="button" onClick={close} aria-label="Close"><CloseIcon /></button>
        </div>
        <form ref={formRef} onSubmit={handleSubmit} className={styles.body}>
          <p className={styles.text}>
            This permanently removes encryption from this {noun}. It will be stored and synced to the
            cloud as plain text. You can encrypt it again later.
          </p>
          {!usable ? (
            <p className={styles.error}>
              {status === 'not-set-up' ? 'Encryption isn’t set up.' : 'Encryption isn’t available right now.'}
            </p>
          ) : (
            <>
              <p className={styles.text}>
                {status === 'locked'
                  ? `Encryption is locked on this device — entering your ${mode === 'passphrase' ? 'passphrase' : 'recovery code'} unlocks it and decrypts this ${noun}.`
                  : `Enter your ${mode === 'passphrase' ? 'vault passphrase' : 'recovery code'} to confirm.`}
              </p>
              <input
                className={styles.input}
                type={mode === 'passphrase' ? 'password' : 'text'}
                placeholder={mode === 'passphrase' ? 'Vault passphrase' : 'Recovery code'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
              {error && <p className={styles.error}>{error}</p>}
              <button
                className={styles.linkBtn}
                type="button"
                onClick={() => { setMode(mode === 'passphrase' ? 'recovery' : 'passphrase'); setValue(''); setError(null); }}
              >
                {mode === 'passphrase' ? 'Use recovery code instead' : 'Use passphrase instead'}
              </button>
            </>
          )}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} type="button" onClick={close}>Cancel</button>
            <button className={styles.submitBtn} type="submit" disabled={!usable || !value || busy}>
              {busy ? 'Decrypting…' : 'Decrypt'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
