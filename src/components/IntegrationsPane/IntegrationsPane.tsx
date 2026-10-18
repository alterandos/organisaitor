import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { parseICS } from '@/utils/icsParser';
import { resolveTimezone } from '@/utils/timezone';
import { icsToDrafts, withEventType } from '@/services/calendarImport/ics';
import { applyImport, findExisting } from '@/services/calendarImport/reconcile';
import type { ImportDraft } from '@/services/calendarImport/draft';
import { repeatSummary } from '@/services/recurringTasks';
import { CalendarImportReviewModal, type ReviewRow } from '@/components/CalendarImportReviewModal/CalendarImportReviewModal';
import type { CollectionId } from '@/types';
import { downloadBackup, downloadAutoBackupSnapshot, restoreBackupData } from '@/utils/backupExport';
import { listBackupSnapshots, type BackupSnapshotMeta } from '@/services/autoBackupStorage';
import styles from './IntegrationsPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { LABELS } from '@/config/labels';
import { log } from '@/utils/log';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';

type ImportStatus = 'idle' | 'success' | 'error';

// ── ICS Calendar Import ───────────────────────────────────────────────────────

function CalendarImportCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timezone     = useSettingsStore((s) => s.timezone);

  const [status,   setStatus]   = useState<ImportStatus>('idle');
  const [imported, setImported] = useState(0);
  const [skipped,  setSkipped]  = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Everything in the file, as drafts (changed and deleted dates of a series included); the review
  // lists one row per event or series, and those come along with their series.
  const [pendingDrafts, setPendingDrafts] = useState<ImportDraft[] | null>(null);
  const [reviewRows,    setReviewRows]    = useState<ReviewRow[] | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result as string;
        const { drafts, partial } = icsToDrafts(parseICS(raw), file.name, resolveTimezone(timezone));
        const rows: ReviewRow[] = drafts.filter((d) => !d.series && !d.cancelled).map((d) => ({
          key:         d.key,
          title:       d.fields.title,
          date:        d.fields.date,
          startTime:   d.fields.startTime,
          endTime:     d.fields.endTime,
          location:    d.fields.location,
          eventType:   d.fields.eventType,
          isDuplicate: !!findExisting(d),
          repeatText:  d.fields.repeat ? repeatSummary(d.fields.repeat) : null,
          partial:     partial.has(d.key),
        }));
        setPendingDrafts(drafts);
        setReviewRows(rows);
      } catch (err) {
        log.warn('calendarImport', 'could not read .ics file', err);
        setErrorMsg('Could not read the file. Make sure it’s a valid .ics calendar file.');
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

  const handleReviewConfirm = (selected: ReviewRow[], collectionId: CollectionId | null) => {
    if (!pendingDrafts) return;
    const chosen = new Map(selected.map((r) => [r.key, r]));
    const drafts = pendingDrafts
      .filter((d) => chosen.has(d.key) || (d.series && chosen.has(d.series.key)))
      .map((d) => {
        const row = chosen.get(d.key);
        return row ? { ...d, fields: withEventType(d.fields, row.eventType) } : d;
      });
    const result = applyImport(drafts, { collectionId });

    setImported(result.created);
    setSkipped((reviewRows?.length ?? 0) - selected.length);
    setStatus('success');
    setReviewRows(null);
    setPendingDrafts(null);
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
          Repeating events come in as repeating events, and anything already in your calendar is left
          out. You'll get a chance to review, deselect, and adjust each event's type (e.g. Birthday)
          and {LABELS.collection} before anything is added.
        </span>
        {status === 'success' && (
          <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
            {imported > 0
              ? `${imported} event${imported !== 1 ? 's' : ''} imported${skipped > 0 ? `, ${skipped} left out` : ''}`
              : 'No events imported'}
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

      {reviewRows && (
        <CalendarImportReviewModal
          rows={reviewRows}
          onConfirm={handleReviewConfirm}
          onCancel={() => { setReviewRows(null); setPendingDrafts(null); }}
        />
      )}
    </div>
  );
}

// ── Export Backup ─────────────────────────────────────────────────────────────

function ExportCard() {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleExport = async () => {
    try {
      // Was reading localStorage.getItem(key) directly, which silently skipped every
      // IndexedDB-backed key (notes-storage, trash-storage) — an export from this pane never
      // included any notes or trashed items. Found and fixed 2026-09-25 while building the
      // automatic backup feature, since it shares this same "build a snapshot" logic —
      // downloadBackup() (utils/backupExport.ts) reads through readPersistedValue(), which is
      // IndexedDB-aware, same as AccountPane's Export always correctly was.
      await downloadBackup();
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
          Download everything — Tasks, Calendar, Records, Lists, Notes, Portfolio, Fitness, and settings — as a JSON file.
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

// ── Export Automatic Snapshot ─────────────────────────────────────────────────

function SnapshotExportCard() {
  const [snapshots,  setSnapshots]  = useState<BackupSnapshotMeta[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status,     setStatus]     = useState<ImportStatus>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');

  useEffect(() => {
    void listBackupSnapshots().then((list) => {
      setSnapshots(list);
      setSelectedId(list[0]?.id ?? null);
    });
  }, []);

  const handleExport = async () => {
    const snap = snapshots?.find((s) => s.id === selectedId);
    if (!snap) return;
    try {
      await downloadAutoBackupSnapshot(snap.id, snap.createdAt);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed. Please try again.');
      setStatus('error');
    }
  };

  const reset = () => setStatus('idle');

  return (
    <div className={styles.card}>
      <div className={styles.cardIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 6v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardName}>Export automatic snapshot</span>
        <span className={styles.cardDesc}>
          Download one of the automatic backups saved on this device as a JSON file — restorable with Restore below.
        </span>
        {snapshots === null ? (
          <span className={styles.cardDesc}>Loading…</span>
        ) : snapshots.length === 0 ? (
          <span className={styles.cardDesc}>No automatic snapshots yet.</span>
        ) : (
          <select
            className={styles.snapshotSelect}
            value={selectedId ?? ''}
            onChange={(e) => { setSelectedId(Number(e.target.value)); reset(); }}
            aria-label="Snapshot to export"
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>{new Date(s.createdAt).toLocaleString()}</option>
            ))}
          </select>
        )}
        {status === 'success' && (
          <div className={`${styles.statusMsg} ${styles.statusSuccess}`}>
            Snapshot downloaded.
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
        <button className={styles.importBtn} onClick={handleExport} disabled={selectedId === null}>
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
  const user = useAuthStore((s) => s.user);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const backup = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        // Was reimplementing the write-each-key loop directly, which skipped rehydrating the
        // three Supabase-synced stores and force-uploading when signed in — AccountPane's
        // restore always did both. restoreBackupData() (utils/backupExport.ts) is the same
        // logic AccountPane now also calls, extracted 2026-09-25 so there's one restore path
        // instead of two that can drift apart.
        await restoreBackupData(backup, user?.id ?? null);
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
  const paneResize = usePaneWidth('integrations-pane', { edge: 'left', min: 300, max: 720 });
  const closeIntegrations = useUIStore((s) => s.closeIntegrations);

  useEscapeClose(closeIntegrations);

  return (
    <>
      <div className={styles.overlay} onClick={closeIntegrations} />
      <aside style={paneResize.style} className={styles.pane}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
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
              <SnapshotExportCard />
              <RestoreCard />
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
