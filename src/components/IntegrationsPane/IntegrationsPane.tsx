import { useRef, useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useCalendarStore } from '@/store/calendarStore';
import { parseICS } from '@/utils/icsParser';
import styles from './IntegrationsPane.module.css';

const BACKUP_KEYS = ['todo-app-storage', 'todo-calendar', 'todo-settings', 'todo-notifications'];

type ImportStatus = 'idle' | 'success' | 'error';

// ── ICS Calendar Import ───────────────────────────────────────────────────────

function CalendarImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const events       = useCalendarStore((s) => s.events);
  const addEvent     = useCalendarStore((s) => s.addEvent);

  const [status,   setStatus]   = useState<ImportStatus>('idle');
  const [imported, setImported] = useState(0);
  const [skipped,  setSkipped]  = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw    = ev.target?.result as string;
        const parsed = parseICS(raw);

        const existingKeys = new Set(
          Object.values(events).map((ev) => `${ev.title}|${ev.date}|${ev.startTime ?? ''}`)
        );

        let importedCount = 0;
        let skippedCount  = 0;

        for (const item of parsed) {
          const key = `${item.title}|${item.date}|${item.startTime ?? ''}`;
          if (existingKeys.has(key)) { skippedCount++; continue; }
          addEvent({
            title:     item.title,
            date:      item.date,
            startTime: item.startTime,
            endTime:   item.endTime,
            notes:     item.notes,
          });
          existingKeys.add(key);
          importedCount++;
        }

        setImported(importedCount);
        setSkipped(skippedCount);
        setStatus('success');
      } catch {
        setErrorMsg('Could not read the file. Make sure it\'s a valid .ics calendar file.');
        setStatus('error');
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      setErrorMsg('File could not be read.');
      setStatus('error');
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const reset = () => setStatus('idle');

  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="4" width="16" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 2v3M14 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="6.5"  cy="12" r="1" fill="currentColor"/>
          <circle cx="10"   cy="12" r="1" fill="currentColor"/>
          <circle cx="13.5" cy="12" r="1" fill="currentColor"/>
        </svg>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardName}>Calendar (.ics)</span>
        <span className={styles.cardDesc}>
          Import from Google Calendar, Outlook, Apple Calendar, or any app that exports .ics files.
          Recurring events are expanded up to 3 years ahead.
        </span>
        {status === 'success' && (
          <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
            {imported > 0
              ? `${imported} event${imported !== 1 ? 's' : ''} imported${skipped > 0 ? `, ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped` : ''}`
              : `No new events — ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`}
            <button className={styles.statusDismiss} onClick={reset}>✕</button>
          </div>
        )}
        {status === 'error' && (
          <div className={`${styles.statusMsg} ${styles.statusError}`}>
            {errorMsg}
            <button className={styles.statusDismiss} onClick={reset}>✕</button>
          </div>
        )}
      </div>
      <div className={styles.cardAction}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics,text/calendar"
          className={styles.fileInput}
          onChange={handleFile}
        />
        <button
          className={styles.importBtn}
          onClick={() => { reset(); fileInputRef.current?.click(); }}
        >
          Import file
        </button>
      </div>
    </div>
  );
}

// ── Export Backup ─────────────────────────────────────────────────────────────

function ExportCard() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleExport = () => {
    try {
      const backup: Record<string, unknown> = {};
      for (const key of BACKUP_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) backup[key] = JSON.parse(val);
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href     = url;
      a.download = `my-todo-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('success');
    } catch {
      setErrorMsg('Export failed. Please try again.');
      setStatus('error');
    }
  };

  const reset = () => setStatus('idle');

  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3v9m0 0-3-3m3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardName}>Export backup</span>
        <span className={styles.cardDesc}>
          Download all your tasks, events, and settings as a JSON file.
        </span>
        {status === 'success' && (
          <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
            Backup downloaded.
            <button className={styles.statusDismiss} onClick={reset}>✕</button>
          </div>
        )}
        {status === 'error' && (
          <div className={`${styles.statusMsg} ${styles.statusError}`}>
            {errorMsg}
            <button className={styles.statusDismiss} onClick={reset}>✕</button>
          </div>
        )}
      </div>
      <div className={styles.cardAction}>
        <button className={styles.importBtn} onClick={handleExport}>
          Export
        </button>
      </div>
    </div>
  );
}

// ── Restore Backup ────────────────────────────────────────────────────────────

function RestoreCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status,   setStatus]   = useState<ImportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const backup = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        let restored = 0;
        for (const key of BACKUP_KEYS) {
          if (key in backup) {
            localStorage.setItem(key, JSON.stringify(backup[key]));
            restored++;
          }
        }
        if (restored === 0) throw new Error('No recognisable data found in this file.');
        setStatus('success');
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not restore — invalid backup file.');
        setStatus('error');
      }
      e.target.value = '';
    };
    reader.onerror = () => {
      setErrorMsg('File could not be read.');
      setStatus('error');
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const reset = () => setStatus('idle');

  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 17V8m0 0 3 3m-3-3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardName}>Restore from backup</span>
        <span className={styles.cardDesc}>
          Restore all data from a previously exported JSON backup. The app will reload automatically.
        </span>
        {status === 'success' && (
          <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
            Data restored — reloading…
          </div>
        )}
        {status === 'error' && (
          <div className={`${styles.statusMsg} ${styles.statusError}`}>
            {errorMsg}
            <button className={styles.statusDismiss} onClick={reset}>✕</button>
          </div>
        )}
      </div>
      <div className={styles.cardAction}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className={styles.fileInput}
          onChange={handleFile}
        />
        <button
          className={styles.importBtn}
          onClick={() => { reset(); fileInputRef.current?.click(); }}
        >
          Restore
        </button>
      </div>
    </div>
  );
}

// ── Pane ──────────────────────────────────────────────────────────────────────

export function IntegrationsPane() {
  const closeIntegrations = useUIStore((s) => s.closeIntegrations);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeIntegrations(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeIntegrations]);

  return (
    <>
      <div className={styles.overlay} onClick={closeIntegrations} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>Data &amp; Integrations</span>
          <button className={styles.closeBtn} onClick={closeIntegrations} aria-label="Close">×</button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Import</h3>
            <CalendarImportCard />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Backup</h3>
            <div className={styles.cardStack}>
              <ExportCard />
              <RestoreCard />
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
