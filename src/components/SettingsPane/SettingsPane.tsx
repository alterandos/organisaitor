import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import styles from './SettingsPane.module.css';

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
              <tbody>
                <tr><td className={styles.hotkeyKey}><kbd>Ctrl</kbd>+<kbd>1</kbd></td><td>Tasks view</td></tr>
                <tr><td className={styles.hotkeyKey}><kbd>Ctrl</kbd>+<kbd>2</kbd></td><td>Calendar view</td></tr>
                <tr><td className={styles.hotkeyKey}><kbd>Space</kbd></td><td>New item (when not typing)</td></tr>
                <tr><td className={styles.hotkeyKey}><kbd>Esc</kbd></td><td>Close panel / modal</td></tr>
              </tbody>
            </table>
          </section>

        </div>
      </aside>
    </>
  );
}
