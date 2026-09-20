import { useEffect, useState } from 'react';
import { useFitnessStore } from '@/store/fitnessStore';
import { useUIStore } from '@/store/uiStore';
import { getActivityType } from '@/utils/fitnessActivityTypes';
import { formatDistance, formatDuration, formatSpeed } from '@/utils/fitnessFormat';
import { formatDate } from '@/utils/date';
import { getStravaConnectUrl, checkStravaStatus, syncStrava, type StravaStatus } from '@/services/strava';
import type { Activity, ActivityId, ActivityType } from '@/types/fitness';
import styles from './FitnessSection.module.css';
import { confirmDelete } from '@/components/ConfirmDialog/dialogs';

function StravaConnect() {
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Post-OAuth redirect: api/strava-oauth-callback.ts sends the user back to
  // /?strava=connected or /?strava=error&reason=... after the token exchange.
  const [message, setMessage] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('strava');
    if (result === 'connected') return 'Strava connected!';
    if (result === 'error') return `Strava connection failed: ${params.get('reason') ?? 'unknown error'}`;
    return null;
  });

  useEffect(() => {
    checkStravaStatus().then(setStatus);
    if (new URLSearchParams(window.location.search).has('strava')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    try {
      const url = await getStravaConnectUrl();
      if (!url) {
        setMessage('Sign in first to connect Strava.');
        return;
      }
      window.location.href = url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not start the Strava connection.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const count = await syncStrava();
      setMessage(`Synced ${count} ${count === 1 ? 'activity' : 'activities'} from Strava.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (status === null) return null;

  return (
    <div className={styles.stravaBar}>
      {status.connected ? (
        <>
          <span className={styles.stravaConnected}>Strava connected</span>
          <button className={styles.stravaBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </>
      ) : (
        <button className={styles.stravaBtn} onClick={handleConnect}>Connect Strava</button>
      )}
      {message && <span className={styles.stravaMessage}>{message}</span>}
    </div>
  );
}

function ActivityRow({ activity, activityTypes }: { activity: Activity; activityTypes: Record<string, ActivityType> }) {
  const deleteActivity  = useFitnessStore((s) => s.deleteActivity);
  const openEditActivity = useUIStore((s) => s.openEditActivity);
  const typeDef = getActivityType(activity.type, activityTypes);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirmDelete('activity', activity.title)) deleteActivity(activity.id);
  };

  return (
    <div className={styles.row} onClick={() => openEditActivity(activity)}>
      <span className={styles.typeIcon} title={typeDef.name}>{typeDef.icon}</span>
      <div className={styles.rowMain}>
        <span className={styles.title}>{activity.title}</span>
        <span className={styles.date}>{formatDate(activity.startedAt)}</span>
      </div>
      <span className={styles.stat}>{formatDistance(activity.distanceMeters)}</span>
      <span className={styles.stat}>{formatDuration(activity.movingTimeSeconds)}</span>
      <span className={styles.stat}>{formatSpeed(activity.averageSpeedMps)}</span>
      {activity.source === 'strava' && (
        <span className={styles.sourceBadge} title="Imported from Strava">Strava</span>
      )}
      <div className={styles.rowActions}>
        <button
          className={styles.actionBtn}
          onClick={(e) => { e.stopPropagation(); openEditActivity(activity); }}
          title="Edit"
        >✎</button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
          onClick={handleDelete}
          title="Delete"
        >✕</button>
      </div>
    </div>
  );
}

export function FitnessSection() {
  const activitiesRecord = useFitnessStore((s) => s.activities);
  const activityTypes    = useFitnessStore((s) => s.activityTypes);
  const showAddActivity  = useUIStore((s) => s.showAddActivity);

  const activities = Object.values(activitiesRecord)
    .filter((a) => !a.archivedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <span className={styles.heading}>Activities</span>
        <button className={styles.addBtn} onClick={showAddActivity}>+ Add activity</button>
      </div>

      <StravaConnect />

      {activities.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateText}>No activities yet. Log a run or hike to get started.</p>
          <button className={styles.emptyStateBtn} onClick={showAddActivity}>+ Add activity</button>
        </div>
      ) : (
        <div className={styles.list}>
          {activities.map((activity) => (
            <ActivityRow key={activity.id as ActivityId} activity={activity} activityTypes={activityTypes} />
          ))}
        </div>
      )}
    </div>
  );
}
