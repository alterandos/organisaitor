import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { HOTKEYS, HOTKEY_GROUPS } from '@/config/hotkeys';
import { listTimezones, resolveTimezone, SYSTEM_TIMEZONE } from '@/utils/timezone';
import { rezoneAllCalendarData } from '@/services/timezoneMigration';
import styles from './SettingsPane.module.css';

function renderKeys(combo: string) {
  const parts = combo.split('+');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <kbd>{part}</kbd>
        </span>
      ))}
    </>
  );
}

function Toggle({
  on, onToggle, label,
}: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

function SettingRow({
  name, desc, children,
}: { name: string; desc: string; children: React.ReactNode }) {
  return (
    <div className={styles.setting}>
      <div className={styles.settingInfo}>
        <span className={styles.settingName}>{name}</span>
        <span className={styles.settingDesc}>{desc}</span>
      </div>
      {children}
    </div>
  );
}

export function SettingsPane() {
  const closeSettings = useUIStore((s) => s.closeSettings);
  const activeView    = useUIStore((s) => s.activeView);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeSettings]);

  const theme                   = useSettingsStore((s) => s.theme);
  const setTheme                = useSettingsStore((s) => s.setTheme);

  const clockFormat             = useSettingsStore((s) => s.clockFormat);
  const setClockFormat          = useSettingsStore((s) => s.setClockFormat);

  const timezone                = useSettingsStore((s) => s.timezone);
  const setTimezone             = useSettingsStore((s) => s.setTimezone);

  const handleTimezoneChange = (nextTz: string) => {
    const fromZone = resolveTimezone(timezone);
    const toZone   = resolveTimezone(nextTz);
    if (fromZone !== toZone) {
      const ok = window.confirm(
        `Change timezone from ${fromZone} to ${toZone}?\n\n` +
        'Every task deadline, scheduled time, calendar event, and reminder that has a time of day ' +
        'will be shifted so it still points at the same real-world moment (e.g. a 2:00 PM event may ' +
        'become 11:00 AM). All-day items (like birthdays) are not affected.'
      );
      if (!ok) return;
      rezoneAllCalendarData(fromZone, toZone);
    }
    setTimezone(nextTz);
  };

  const colorEnabled            = useSettingsStore((s) => s.colorEnabled);
  const priorityColorEnabled    = useSettingsStore((s) => s.priorityColorEnabled);
  const alwaysShowDueDate       = useSettingsStore((s) => s.alwaysShowDueDate);
  const toggleColor             = useSettingsStore((s) => s.toggleColor);
  const togglePriorityColor     = useSettingsStore((s) => s.togglePriorityColor);
  const toggleAlwaysShowDueDate = useSettingsStore((s) => s.toggleAlwaysShowDueDate);

  const shadePastDays              = useSettingsStore((s) => s.shadePastDays);
  const shadeWeekends              = useSettingsStore((s) => s.shadeWeekends);
  const weekendShadeColor          = useSettingsStore((s) => s.weekendShadeColor);
  const strikethroughPastDays      = useSettingsStore((s) => s.strikethroughPastDays);
  const toggleShadePastDays        = useSettingsStore((s) => s.toggleShadePastDays);
  const toggleShadeWeekends        = useSettingsStore((s) => s.toggleShadeWeekends);
  const setWeekendShadeColor       = useSettingsStore((s) => s.setWeekendShadeColor);
  const toggleStrikethroughPastDays = useSettingsStore((s) => s.toggleStrikethroughPastDays);

  return (
    <>
      <div className={styles.overlay} onClick={closeSettings} />
      <aside className={styles.pane}>
        <header className={styles.header}>
          <span className={styles.heading}>Settings</span>
          <button className={styles.closeBtn} onClick={closeSettings} aria-label="Close settings">×</button>
        </header>

        <div className={styles.body}>

          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Appearance</h3>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Theme</span>
                <span className={styles.settingDesc}>Light, dark, system</span>
              </div>
              <div className={styles.themeToggle}>
                {(['light', 'system', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    className={`${styles.themeBtn} ${theme === t ? styles.themeBtnActive : ''}`}
                    onClick={() => setTheme(t)}
                  >
                    {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Clock format</span>
                <span className={styles.settingDesc}></span>
              </div>
              <div className={styles.themeToggle}>
                {(['24h', '12h', 'system'] as const).map((f) => (
                  <button
                    key={f}
                    className={`${styles.themeBtn} ${clockFormat === f ? styles.themeBtnActive : ''}`}
                    onClick={() => setClockFormat(f)}
                  >
                    {f === '24h' ? '24-hour' : f === '12h' ? 'AM/PM' : 'System'}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Timezone</span>
                <span className={styles.settingDesc}>
                  {timezone === SYSTEM_TIMEZONE
                    ? `Automatic — currently ${resolveTimezone(SYSTEM_TIMEZONE)}`
                    : 'Fixed — overrides the host machine\'s clock'}
                </span>
              </div>
              <select
                className={styles.timezoneSelect}
                value={timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
              >
                <option value={SYSTEM_TIMEZONE}>System (auto-detect)</option>
                {listTimezones().map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </section>

          {activeView === 'tasks' && (
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Display</h3>

              <SettingRow
                name="Collection colour shading"
                desc="Background tint on tasks based on their collection colour"
              >
                <Toggle on={colorEnabled} onToggle={toggleColor} label="Toggle collection colour shading" />
              </SettingRow>

              <SettingRow
                name="Priority colour shading"
                desc="Gradient on the right side of tasks based on priority"
              >
                <Toggle on={priorityColorEnabled} onToggle={togglePriorityColor} label="Toggle priority colour shading" />
              </SettingRow>

              <SettingRow
                name="Always show due date"
                desc="Display due dates on task cards without needing to hover"
              >
                <Toggle on={alwaysShowDueDate} onToggle={toggleAlwaysShowDueDate} label="Toggle always show due date" />
              </SettingRow>
            </section>
          )}

          {activeView === 'calendar' && (
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Calendar display</h3>

              <SettingRow
                name="Shade past days"
                desc="Applies a dark grey tint to days that have already passed"
              >
                <Toggle on={shadePastDays} onToggle={toggleShadePastDays} label="Toggle shade past days" />
              </SettingRow>

              <SettingRow
                name="Shade weekends"
                desc="Applies a colour tint to Saturday and Sunday columns"
              >
                <Toggle on={shadeWeekends} onToggle={toggleShadeWeekends} label="Toggle shade weekends" />
              </SettingRow>

              {shadeWeekends && (
                <div className={styles.colorPickerRow}>
                  <span className={styles.colorPickerLabel}>Weekend colour</span>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={weekendShadeColor}
                    onChange={(e) => setWeekendShadeColor(e.target.value)}
                    aria-label="Weekend shade colour"
                  />
                </div>
              )}

              <SettingRow
                name="Strikethrough past days"
                desc="Draws a diagonal line across days that have already passed"
              >
                <Toggle on={strikethroughPastDays} onToggle={toggleStrikethroughPastDays} label="Toggle strikethrough past days" />
              </SettingRow>
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Keyboard shortcuts</h3>
            <table className={styles.hotkeys}>
              <thead>
                <tr>
                  <th className={styles.hotkeyColHead}>Primary</th>
                  <th className={styles.hotkeyColHead}>Secondary</th>
                  <th className={styles.hotkeyColHead}>Action</th>
                </tr>
              </thead>
              <tbody>
                {HOTKEY_GROUPS.map((group) => (
                  <>
                    <tr key={group}>
                      <th colSpan={3} className={styles.hotkeyGroup}>{group}</th>
                    </tr>
                    {HOTKEYS.filter((h) => h.group === group).map((h) => (
                      <tr key={h.primary}>
                        <td className={styles.hotkeyKey}>{renderKeys(h.primary)}</td>
                        <td className={styles.hotkeyKey}>{h.secondary ? renderKeys(h.secondary) : '—'}</td>
                        <td>{h.action}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </section>

        </div>
      </aside>
    </>
  );
}
