import { useEffect, useState } from 'react';
import { LABELS } from '@/config/labels';
import { useSettingsStore } from '@/store/settingsStore';
import { TimeInput } from '@/components/TimeInput/TimeInput';
import {
  getNotificationStatus, openExactAlarmSettings, requestNotificationPermission, sendTestNotification,
} from '@/services/notifications/androidScheduler';
import { SettingRow, Toggle } from './SettingControls';
import styles from './SettingsPane.module.css';

// Settings → Notifications, Android only (docs/android/05-notifications.md N9). Desktop/web
// notifications come from the in-app checker and need no setup.
export function NotificationsSection() {
  const L = LABELS.notifications.settings;
  const notifyReminders      = useSettingsStore((s) => s.notifyReminders);
  const notifyEvents         = useSettingsStore((s) => s.notifyEvents);
  const snoozeMorningTime    = useSettingsStore((s) => s.snoozeMorningTime);
  const snoozeEveningTime    = useSettingsStore((s) => s.snoozeEveningTime);
  const quietHours           = useSettingsStore((s) => s.quietHours);
  const setNotifyReminders   = useSettingsStore((s) => s.setNotifyReminders);
  const setNotifyEvents      = useSettingsStore((s) => s.setNotifyEvents);
  const setSnoozeMorningTime = useSettingsStore((s) => s.setSnoozeMorningTime);
  const setSnoozeEveningTime = useSettingsStore((s) => s.setSnoozeEveningTime);
  const setQuietHours        = useSettingsStore((s) => s.setQuietHours);

  const [status, setStatus] = useState<{ display: string; exact: string } | null>(null);
  const refresh = () => { void getNotificationStatus().then(setStatus); };
  useEffect(refresh, []);

  const turnOn = async () => { await requestNotificationPermission(); refresh(); };
  const fixExact = async () => { await openExactAlarmSettings(); refresh(); };

  const permissionText = !status ? '' : status.display === 'granted' ? L.statusOn : status.display === 'denied' ? L.statusOff : L.statusAsk;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{L.heading}</h3>

      <SettingRow name={L.status} desc={permissionText}>
        {status && status.display !== 'granted' && status.display !== 'denied' && (
          <button type="button" className={styles.hotkeysResetAllBtn} onClick={turnOn}>{L.turnOn}</button>
        )}
      </SettingRow>

      {status?.display === 'granted' && (
        <SettingRow name={L.exact} desc={status.exact === 'granted' ? L.exactOn : L.exactOff}>
          {status.exact !== 'granted' && (
            <button type="button" className={styles.hotkeysResetAllBtn} onClick={fixExact}>{L.exactFix}</button>
          )}
        </SettingRow>
      )}

      <SettingRow name={L.reminders} desc="">
        <Toggle on={notifyReminders} onToggle={() => setNotifyReminders(!notifyReminders)} label={L.reminders} />
      </SettingRow>
      <SettingRow name={L.events} desc="">
        <Toggle on={notifyEvents} onToggle={() => setNotifyEvents(!notifyEvents)} label={L.events} />
      </SettingRow>

      <SettingRow name={L.morning} desc="">
        <TimeInput value={snoozeMorningTime} onChange={(v) => { if (v) setSnoozeMorningTime(v); }} />
      </SettingRow>
      <SettingRow name={L.evening} desc="">
        <TimeInput value={snoozeEveningTime} onChange={(v) => { if (v) setSnoozeEveningTime(v); }} />
      </SettingRow>

      <SettingRow name={L.quiet} desc={L.quietHint}>
        <Toggle on={quietHours.enabled} onToggle={() => setQuietHours({ enabled: !quietHours.enabled })} label={L.quiet} />
      </SettingRow>
      {quietHours.enabled && (
        <div className={styles.setting}>
          <span className={styles.settingName}>{L.quietFrom}</span>
          <TimeInput value={quietHours.start} onChange={(v) => { if (v) setQuietHours({ start: v }); }} />
          <span className={styles.settingName}>{L.quietTo}</span>
          <TimeInput value={quietHours.end} onChange={(v) => { if (v) setQuietHours({ end: v }); }} />
        </div>
      )}

      <SettingRow name={L.test} desc={L.battery}>
        <button type="button" className={styles.hotkeysResetAllBtn} onClick={() => void sendTestNotification()} disabled={status?.display !== 'granted'}>
          {L.test}
        </button>
      </SettingRow>
    </section>
  );
}
