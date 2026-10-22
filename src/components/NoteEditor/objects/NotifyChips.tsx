import { useState } from 'react';
import { NotifyRuleEditor } from '@/components/AllDayNotifyField/NotifyLead';
import { useSettingsStore } from '@/store/settingsStore';
import { formatTime } from '@/utils/date';
import { describeRule, fitRule, type NotifyRule } from '@/utils/notifyRule';
import { LABELS } from '@/config/labels';
import styles from './ObjectBody.module.css';

const L = LABELS.noteObjects.body;
const BELL = '🔔';

// Esc closes the little editor (and nothing around it).
const closeOnEscape = (close: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
};

// A calendar item's notify setting in its expanded pane in a note: a chip saying what it is
// ("🔔 2 hours before", "🔔 1 day before, at 17:00"); click to change it with the same editor the
// calendar panes use (NotifyRuleEditor, utils/notifyRule.ts), or turn it off.
export function NotifyChip({ item, timed, rule, onChange }: { item: 'event' | 'reminder' | 'deadline'; timed: boolean; rule: NotifyRule; onChange: (rule: NotifyRule) => void }) {
  const [editing, setEditing] = useState(false);
  const clock = useSettingsStore((s) => s.clockFormat);
  const shown = fitRule(rule, item, timed);
  if (shown.kind === 'off') return null;
  if (editing) {
    return (
      <span className={styles.settingEditor} onKeyDown={closeOnEscape(() => setEditing(false))}>
        {BELL}
        <NotifyRuleEditor item={item} timed={timed} rule={shown} onChange={onChange} />
        <button type="button" className={styles.settingBtn} onClick={() => setEditing(false)}>{L.notifyDone}</button>
        <button type="button" className={styles.settingBtn} onClick={() => { onChange({ kind: 'off' }); setEditing(false); }}>{L.notifyOff}</button>
      </span>
    );
  }
  return (
    <button type="button" className={styles.setting} title={L.notifyTitle} onClick={() => setEditing(true)}>
      {BELL} {describeRule(shown, (t) => formatTime(t, clock))}
    </button>
  );
}

// Notify while it's off, offered greyed in the bottom bar: turning it on starts from the usual rule.
export function NotifyMeOption({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <button type="button" className={`${styles.ghost} ${styles.offOption}`} title={L.turnOn(L.notifyMe)} onClick={onTurnOn}>
      <span className={styles.offIcon}>{BELL}</span> {L.notifyMe}
    </button>
  );
}
