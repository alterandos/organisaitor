import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { HOTKEYS, HOTKEY_GROUPS } from '@/config/hotkeys';
import { useHotkeyOverridesStore, findConflicts } from '@/store/hotkeyOverridesStore';
import { captureBindingFromEvent } from '@/utils/hotkeyBinding';
import { listTimezones, resolveTimezone, SYSTEM_TIMEZONE } from '@/utils/timezone';
import { rezoneAllCalendarData } from '@/services/timezoneMigration';
import styles from './SettingsPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';

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

// One customizable Primary/Secondary cell — click to capture a new binding (or Escape to
// cancel), matching the requested "click a hotkey to update it" interaction. Non-
// customizable and protected hotkeys never render this — see renderKeys usage below.
function HotkeyCell({
  binding, listening, onStartListening,
}: { binding: string | null; listening: boolean; onStartListening: () => void }) {
  return (
    <td className={styles.hotkeyKey}>
      <button
        type="button"
        className={`${styles.hotkeyCellBtn} ${listening ? styles.hotkeyCellListening : ''}`}
        onClick={onStartListening}
      >
        {listening ? 'Press a key…' : (binding ? renderKeys(binding) : '—')}
      </button>
    </td>
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

  // Hotkey-rebind capture state — a separate Escape handler below cancels capture rather
  // than closing the whole pane; this one must not also fire in that case (same class of
  // bug as AddScheduleModal/CalendarSidePane's Escape collision — see CLAUDE.md).
  const [listening, setListening] = useState<{ id: string; slot: 'primary' | 'secondary' } | null>(null);
  const overrides           = useHotkeyOverridesStore((s) => s.overrides);
  const setHotkeyOverride   = useHotkeyOverridesStore((s) => s.setOverride);
  const resetHotkeyOverride = useHotkeyOverridesStore((s) => s.resetHotkey);
  const resetAllHotkeys     = useHotkeyOverridesStore((s) => s.resetAll);

  const effectiveBinding = (h: (typeof HOTKEYS)[number], slot: 'primary' | 'secondary'): string | null => {
    const o = overrides[h.id];
    if (o && slot in o) return o[slot] ?? null;
    return slot === 'primary' ? h.primary : (h.secondary ?? null);
  };

  useEscapeClose(() => { if (!listening) closeSettings(); });

  // Captures the next keypress while `listening` is set. Registered in the capture phase
  // so it runs before the effect above (and before anything else) — Escape here cancels
  // capture only, it must not also propagate into closing the pane.
  useEffect(() => {
    if (!listening) return;
    // listening.id is only ever set from a real HOTKEYS entry (see onStartListening below).
    const def = HOTKEYS.find((h) => h.id === listening.id)!;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setListening(null); return; }

      const binding = captureBindingFromEvent(e);
      if (!binding) return; // bare modifier press — keep listening for a real key

      if (binding === effectiveBinding(def, listening.slot)) { setListening(null); return; }

      const conflicts = findConflicts(binding, listening.id);
      if (conflicts.length > 0) {
        const names = conflicts.map((c) => c.action).join(', ');
        const target = listening;
        // Stop capturing first, or the dialog's own keypresses would be read as a new binding.
        setListening(null);
        void confirmDialog({
          title: `Reassign "${binding}"?`,
          message:
            `"${binding}" is already used by: ${names}.\n\nReassign it to "${def.action}" instead? ` +
            'The other action will lose this binding (its other slot, if any, is unaffected).',
          confirmLabel: 'Reassign',
        }).then((proceed) => {
          if (!proceed) return;
          conflicts.forEach((c) => {
            const cDef = HOTKEYS.find((h) => h.id === c.id);
            if (!cDef) return;
            if (effectiveBinding(cDef, 'primary')   === binding) setHotkeyOverride(c.id, 'primary',   null);
            if (effectiveBinding(cDef, 'secondary') === binding) setHotkeyOverride(c.id, 'secondary', null);
          });
          setHotkeyOverride(target.id, target.slot, binding);
        });
        return;
      }

      setHotkeyOverride(listening.id, listening.slot, binding);
      setListening(null);
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, overrides]);

  const theme                   = useSettingsStore((s) => s.theme);
  const setTheme                = useSettingsStore((s) => s.setTheme);

  const clockFormat             = useSettingsStore((s) => s.clockFormat);
  const setClockFormat          = useSettingsStore((s) => s.setClockFormat);

  const timezone                = useSettingsStore((s) => s.timezone);
  const setTimezone             = useSettingsStore((s) => s.setTimezone);

  const handleTimezoneChange = async (nextTz: string) => {
    const fromZone = resolveTimezone(timezone);
    const toZone   = resolveTimezone(nextTz);
    if (fromZone !== toZone) {
      const ok = await confirmDialog({
        title: `Change timezone from ${fromZone} to ${toZone}?`,
        message:
          'Every task deadline, scheduled time, calendar event, and reminder that has a time of day ' +
          'will be shifted so it still points at the same real-world moment (e.g. a 2:00 PM event may ' +
          'become 11:00 AM). All-day items (like birthdays) are not affected.',
        confirmLabel: 'Change timezone',
      });
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
            <div className={styles.hotkeysHeader}>
              <h3 className={styles.sectionLabel}>Keyboard shortcuts</h3>
              {Object.keys(overrides).length > 0 && (
                <button
                  type="button"
                  className={styles.hotkeysResetAllBtn}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: 'Reset all hotkeys?',
                      message: 'Every customized hotkey goes back to its default.',
                      confirmLabel: 'Reset all',
                    });
                    if (ok) resetAllHotkeys();
                  }}
                >
                  Reset all to defaults
                </button>
              )}
            </div>
            <p className={styles.hotkeysHint}>
              Click a Primary or Secondary shortcut to change it, then press the new key combination
              (Escape cancels). Rows without a click affordance are not yet customizable —
              see CLAUDE.md for which hotkeys are wired through this.
            </p>
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
                      <tr key={h.id}>
                        {h.customizable ? (
                          <>
                            <HotkeyCell
                              binding={effectiveBinding(h, 'primary')}
                              listening={listening?.id === h.id && listening.slot === 'primary'}
                              onStartListening={() => setListening({ id: h.id, slot: 'primary' })}
                            />
                            <HotkeyCell
                              binding={effectiveBinding(h, 'secondary')}
                              listening={listening?.id === h.id && listening.slot === 'secondary'}
                              onStartListening={() => setListening({ id: h.id, slot: 'secondary' })}
                            />
                          </>
                        ) : (
                          <>
                            <td className={styles.hotkeyKey}>{renderKeys(h.primary)}</td>
                            <td className={styles.hotkeyKey}>{h.secondary ? renderKeys(h.secondary) : '—'}</td>
                          </>
                        )}
                        <td>
                          {h.action}
                          {h.id in overrides && (
                            <button
                              type="button"
                              className={styles.hotkeyResetBtn}
                              onClick={() => resetHotkeyOverride(h.id)}
                              title="Reset this hotkey to its default"
                            >↺</button>
                          )}
                        </td>
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
