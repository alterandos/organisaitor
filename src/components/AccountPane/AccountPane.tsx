import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { isSupabaseConfigured } from '@/services/supabase';
import styles from './AccountPane.module.css';

function downloadBackup() {
  const { tasks, collections, tags, purposes } = useTaskStore.getState();
  const { events, reminders } = useCalendarStore.getState();
  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tasks, collections, tags, purposes, events, reminders,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `organisaitor-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Mode = 'signin' | 'signup';

export function AccountPane() {
  const closeAccount = useUIStore((s) => s.closeAccount);
  const { user, loading, signIn, signUp, signOut } = useAuthStore();

  const [mode,     setMode]     = useState<Mode>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAccount(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeAccount]);

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
      else closeAccount();
    } else {
      const err = await signUp(email.trim(), password);
      if (err) setError(err);
      else setSuccess('Check your email to confirm your account, then sign in.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setEmail('');
    setPassword('');
    setSuccess('Signed out.');
  };

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
              <span className={styles.badge}>Synced</span>
              <span className={styles.email}>{user.email}</span>
            </div>
            <p className={styles.hint}>Your data is syncing to the cloud. Sign in on any device to access it.</p>
            <button className={styles.exportBtn} onClick={downloadBackup} type="button">
              Export backup (JSON)
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
                  autoFocus
                  autoComplete="email"
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                {error && <p className={styles.errorMsg}>{error}</p>}
                <button className={styles.submitBtn} type="submit" disabled={loading || !isSupabaseConfigured}>
                  {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            )}

            <button className={styles.guestLink} onClick={closeAccount}>
              Continue without account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
