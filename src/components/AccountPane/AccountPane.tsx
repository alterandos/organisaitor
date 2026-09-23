import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useTrackerStore } from '@/store/trackerStore';
import { isSupabaseConfigured } from '@/services/supabase';
import { requestSignOut } from '@/services/signOut';
import { forceUpload, onSyncStatus, type SyncStatus } from '@/services/sync/syncService';
import {
  onVaultStatus, type VaultStatus,
  setupVault, unlockWithPassphrase, unlockWithRecoveryCode, lockVault,
  trustThisDevice, getVaultError, retryVaultCheck,
} from '@/services/vault';
import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { downloadBackup } from '@/utils/backupExport';
import { writePersistedValue } from '@/utils/idbStorage';
import styles from './AccountPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';

type Mode = 'signin' | 'signup';

const REMEMBERED_EMAIL_KEY = 'todo-remembered-email';

export function AccountPane() {
  const closeAccount     = useUIStore((s) => s.closeAccount);
  const openRecyclingBin = useUIStore((s) => s.openRecyclingBin);
  const { user, loading, signIn, signUp } = useAuthStore();

  const [rememberedEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [mode,        setMode]        = useState<Mode>('signin');
  const [email,       setEmail]       = useState(rememberedEmail ?? '');
  const [rememberMe,  setRememberMe]  = useState(rememberedEmail !== null);
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);
  const [syncStatus,  setSyncStatus]  = useState<SyncStatus>('idle');
  const [syncErr,     setSyncErr]     = useState<string | null>(null);
  const [restoring,   setRestoring]   = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Encryption vault ──
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>('unknown');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  // Setup
  const [setupPassphrase, setSetupPassphrase] = useState('');
  const [setupPassphrase2, setSetupPassphrase2] = useState('');
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  // Unlock
  const [unlockValue, setUnlockValue] = useState('');
  const [unlockMode, setUnlockMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [trustDevice, setTrustDevice] = useState(true);
  const [showUnlock, setShowUnlock] = useState(false);

  useEscapeClose(closeAccount);

  useEffect(() => onSyncStatus((s, e) => { setSyncStatus(s); setSyncErr(e); }), []);
  useEffect(() => onVaultStatus((s) => { setVaultStatus(s); if (s !== 'locked') setShowUnlock(false); }), []);

  const handleSetupVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setVaultError(null);
    if (setupPassphrase.length < 8) { setVaultError('Passphrase must be at least 8 characters.'); return; }
    if (setupPassphrase !== setupPassphrase2) { setVaultError('Passphrases don’t match.'); return; }
    setVaultBusy(true);
    try {
      const { recoveryCode } = await setupVault(user.id, setupPassphrase);
      setPendingRecoveryCode(recoveryCode);
      setSetupPassphrase('');
      setSetupPassphrase2('');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Failed to set up encryption.');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleConfirmRecoverySaved = async () => {
    if (!user || !trustDevice) { setPendingRecoveryCode(null); setRecoverySaved(false); return; }
    await trustThisDevice(user.id);
    setPendingRecoveryCode(null);
    setRecoverySaved(false);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setVaultError(null);
    setVaultBusy(true);
    try {
      const ok = unlockMode === 'passphrase'
        ? await unlockWithPassphrase(unlockValue)
        : await unlockWithRecoveryCode(unlockValue);
      if (!ok) {
        setVaultError(unlockMode === 'passphrase' ? 'Incorrect passphrase.' : 'Incorrect recovery code.');
        return;
      }
      setUnlockValue('');
      setShowUnlock(false);
      if (trustDevice) await trustThisDevice(user.id);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Failed to unlock.');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || password.length < 6) {
      setError('Email and password (min 6 chars) required.');
      return;
    }

    if (mode === 'signin') {
      const err = await signIn(email.trim(), password);
      if (err) setError(err);
      else {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        closeAccount();
      }
    } else {
      const err = await signUp(email.trim(), password);
      if (err) setError(err);
      else setSuccess('Check your email to confirm your account, then sign in.');
    }
  };

  const handleSignOut = async () => {
    if (!await requestSignOut()) return;
    setEmail(localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '');
    setPassword('');
  };

  const handleForceUpload = async () => {
    if (!user) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const counts = await forceUpload(user.id);
      setSuccess(
        `Uploaded to Supabase: ${counts.tasks} tasks, ${counts.collections} endeavours, ` +
        `${counts.tags} tags, ${counts.purposes} purposes, ${counts.events} events, ` +
        `${counts.reminders} reminders, ${counts.entries} tracker entries, ` +
        `${counts.schedules} schedules, ${counts.lists} lists, ${counts.listItems} list items, ` +
        `${counts.listTypes} custom list types, ${counts.notes} notes, ${counts.noteTags} note tags, ` +
        `${counts.structuredTagEntries} structured tag entries, ${counts.watchlistItems} watchlist items, ` +
        `${counts.portfolioTags} portfolio tags, ${counts.investmentPurposes} investment purposes.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Force upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setError(null);
    try {
      const text   = await file.text();
      const backup = JSON.parse(text);

      let restored = 0;
      for (const key of PERSISTED_STORAGE_KEYS) {
        if (key in backup) {
          await writePersistedValue(key, JSON.stringify(backup[key]));
          restored++;
        }
      }
      if (restored === 0) throw new Error('No recognisable data found in this file.');

      // Bring the Supabase-synced stores' in-memory state up to date with what was
      // just written to localStorage, so forceUpload() (which reads live state, not
      // localStorage) pushes the restored data instead of what was there before.
      await Promise.all([
        useTaskStore.persist.rehydrate(),
        useCalendarStore.persist.rehydrate(),
        useTrackerStore.persist.rehydrate(),
      ]);

      if (user) {
        await forceUpload(user.id);
        setSuccess('Data restored and uploaded to Supabase. Reloading…');
      } else {
        setSuccess('Data restored locally. Reloading…');
      }
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup.');
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const syncLabel = syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error'   ? 'Sync error'
    : 'Synced';

  const syncBadgeClass = syncStatus === 'error' ? styles.badgeError
    : syncStatus === 'syncing' ? styles.badgeSyncing
    : styles.badge;

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeAccount(); }}>
      <div className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.title}>Account</span>
          <button className={styles.closeBtn} onClick={closeAccount} aria-label="Close">✕</button>
        </header>

        {!isSupabaseConfigured && (
          <div className={styles.notice}>
            Supabase not configured. Add credentials to <code>.env.local</code> to enable sync.
          </div>
        )}

        {user ? (
          <div className={styles.body}>
            <div className={styles.signedInRow}>
              <span className={syncBadgeClass}>{syncLabel}</span>
              <span className={styles.email}>{user.email}</span>
            </div>
            {syncStatus === 'error' && syncErr && (
              <p className={styles.errorMsg}>{syncErr}</p>
            )}
            <p className={styles.hint}>Your data syncs to the cloud automatically. Sign in on any device to access it.</p>

            {success && <p className={styles.successMsg}>{success}</p>}
            {error   && <p className={styles.errorMsg}>{error}</p>}

            <div className={styles.vaultSection}>
              {pendingRecoveryCode ? (
                <>
                  <p className={styles.hint}>
                    Save this recovery code somewhere safe — it's the <strong>only</strong> way back into your
                    encrypted notes if you forget your passphrase. It won't be shown again.
                  </p>
                  <div className={styles.recoveryCode}>{pendingRecoveryCode}</div>
                  <label className={styles.checkboxRow}>
                    <input type="checkbox" checked={recoverySaved} onChange={(e) => setRecoverySaved(e.target.checked)} />
                    I've saved this recovery code
                  </label>
                  <button
                    className={styles.submitBtn}
                    type="button"
                    disabled={!recoverySaved}
                    onClick={handleConfirmRecoverySaved}
                  >
                    Continue
                  </button>
                </>
              ) : vaultStatus === 'not-set-up' ? (
                <form onSubmit={handleSetupVault}>
                  <p className={styles.hint}>
                    Set up encryption to protect Note content — encrypted client-side before it ever
                    reaches Supabase, using a passphrase only you know.
                  </p>
                  {vaultError && <p className={styles.errorMsg}>{vaultError}</p>}
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="New passphrase (min 8 characters)"
                    value={setupPassphrase}
                    onChange={(e) => setSetupPassphrase(e.target.value)}
                    autoComplete="new-password"
                  />
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="Confirm passphrase"
                    value={setupPassphrase2}
                    onChange={(e) => setSetupPassphrase2(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button className={styles.submitBtn} type="submit" disabled={vaultBusy}>
                    {vaultBusy ? 'Setting up…' : 'Set up encryption'}
                  </button>
                </form>
              ) : vaultStatus === 'locked' && !showUnlock ? (
                <button
                  className={styles.lockedBtn}
                  type="button"
                  onClick={() => { setVaultError(null); setShowUnlock(true); }}
                  title="Encryption is locked on this device — click to unlock"
                >
                  <span className={styles.lockedIcon} aria-hidden="true">🔒</span>
                  <span>Encryption locked</span>
                  <span className={styles.lockedSub}>Click to unlock</span>
                </button>
              ) : vaultStatus === 'locked' ? (
                <form onSubmit={handleUnlock}>
                  {vaultError && <p className={styles.errorMsg}>{vaultError}</p>}
                  <input
                    className={styles.input}
                    type={unlockMode === 'passphrase' ? 'password' : 'text'}
                    placeholder={unlockMode === 'passphrase' ? 'Vault passphrase' : 'Recovery code'}
                    value={unlockValue}
                    onChange={(e) => setUnlockValue(e.target.value)}
                    autoComplete="current-password"
                  />
                  <label className={styles.checkboxRow}>
                    <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
                    Trust this device (skip this prompt next time)
                  </label>
                  <button className={styles.submitBtn} type="submit" disabled={vaultBusy || !unlockValue}>
                    {vaultBusy ? 'Unlocking…' : 'Unlock'}
                  </button>
                  <button
                    className={styles.guestLink}
                    type="button"
                    onClick={() => { setUnlockMode(unlockMode === 'passphrase' ? 'recovery' : 'passphrase'); setUnlockValue(''); setVaultError(null); }}
                  >
                    {unlockMode === 'passphrase' ? 'Use recovery code instead' : 'Use passphrase instead'}
                  </button>
                  <button
                    className={styles.guestLink}
                    type="button"
                    onClick={() => { setShowUnlock(false); setUnlockValue(''); setVaultError(null); }}
                  >
                    Cancel
                  </button>
                </form>
              ) : vaultStatus === 'unavailable' ? (
                <>
                <p className={styles.hint}>
                  Encryption is unavailable right now — the vault couldn't be read from Supabase
                  (check that migrations 019 and 022 have been run). Everything else syncs normally.
                  {getVaultError() && <><br /><code>{getVaultError()}</code></>}
                </p>
                <button className={styles.exportBtn} type="button" onClick={() => user && retryVaultCheck(user.id)}>Retry</button>
                </>
              ) : vaultStatus === 'unknown' ? (
                <>
                  <p className={styles.hint}>Checking encryption status… (gives up after 15s and says why)</p>
                  <button className={styles.exportBtn} type="button" onClick={() => user && retryVaultCheck(user.id)}>Retry</button>
                </>
              ) : vaultStatus === 'unlocked' ? (
                <div className={styles.signedInRow}>
                  <span className={styles.badge}>🔓 Encryption unlocked</span>
                  <button className={styles.guestLink} type="button" onClick={() => { setShowUnlock(false); void lockVault(); }}>Lock now</button>
                </div>
              ) : null}
            </div>

            <button
              className={styles.exportBtn}
              onClick={handleForceUpload}
              disabled={uploading}
              type="button"
              title="Pushes everything currently on this device to Supabase, reading live app state directly — no reload, no file round-trip."
            >
              {uploading ? 'Uploading…' : 'Force upload this device’s data to cloud'}
            </button>
            <button className={styles.exportBtn} onClick={downloadBackup} type="button">
              Export backup (JSON)
            </button>
            <button
              className={styles.exportBtn}
              onClick={() => fileRef.current?.click()}
              disabled={restoring}
              type="button"
            >
              {restoring ? 'Restoring…' : 'Restore from backup (JSON)'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              hidden
              onChange={handleRestoreFile}
            />
            <button
              className={styles.exportBtn}
              onClick={() => { closeAccount(); openRecyclingBin(); }}
              type="button"
            >
              {LABELS.recyclingBin.openFromAccount}
            </button>
            <button className={styles.signOutBtn} onClick={handleSignOut} disabled={loading}>
              Sign out
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${mode === 'signin' ? styles.tabActive : ''}`}
                onClick={() => { setMode('signin'); setError(null); setSuccess(null); }}
              >Sign in</button>
              <button
                className={`${styles.tab} ${mode === 'signup' ? styles.tabActive : ''}`}
                onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
              >Create account</button>
            </div>

            {success ? (
              <p className={styles.successMsg}>{success}</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus={!email}
                  autoComplete="email"
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus={!!email}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                {mode === 'signin' && (
                  <label className={styles.checkboxRow}>
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    Remember my email
                  </label>
                )}
                {error && <p className={styles.errorMsg}>{error}</p>}
                <button className={styles.submitBtn} type="submit" disabled={loading || !isSupabaseConfigured}>
                  {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            )}

            <div className={styles.guestSection}>
              <button className={styles.exportBtn} onClick={() => fileRef.current?.click()} type="button">
                Restore from backup (JSON)
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                hidden
                onChange={handleRestoreFile}
              />
              <button
                className={styles.exportBtn}
                onClick={() => { closeAccount(); openRecyclingBin(); }}
                type="button"
              >
                {LABELS.recyclingBin.openFromAccount}
              </button>
              <button className={styles.guestLink} onClick={closeAccount}>
                Continue without account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
