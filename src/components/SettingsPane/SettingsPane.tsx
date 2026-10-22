import { Fragment, useEffect, useState } from 'react';
import type { AppView } from '@/store/uiStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore, NOTE_COLOR_BARS, LINK_SUGGESTIONS } from '@/store/settingsStore';
import { LABELS } from '@/config/labels';
import { HOTKEYS, HOTKEY_GROUPS } from '@/config/hotkeys';
import { useHotkeyOverridesStore, findConflicts, getEffectiveBinding } from '@/store/hotkeyOverridesStore';
import { SPEECH_LANGUAGES } from '@/services/speech/languages';
import { captureBindingFromEvent } from '@/utils/hotkeyBinding';
import { listTimezones, resolveTimezone, SYSTEM_TIMEZONE } from '@/utils/timezone';
import { rezoneAllCalendarData } from '@/services/timezoneMigration';
import { StorageSection } from './StorageSection';
import { NotificationsSection } from './NotificationsSection';
import { TypingShortcutsSection } from './TypingShortcutsSection';
import { ConvertersSection } from './ConvertersSection';
import { SettingRow, Toggle } from './SettingControls';
import { usePlatform } from '@/hooks/usePlatform';
import styles from './SettingsPane.module.css';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { confirmDialog } from '@/components/ConfirmDialog/dialogs';
import { ResizeHandle } from '@/components/ResizeHandle/ResizeHandle';
import { usePaneWidth } from '@/components/ResizeHandle/usePaneWidth';
import { CloseIcon, ResetIcon } from '@/components/Icons';

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

type SettingsSectionId = 'appearance' | 'voice' | 'typing' | 'converters' | 'notifications' | 'storage' | 'tasks' | 'notes' | 'calendar' | 'hotkeys';

// Two ways in, as with the library (the ☰ hover Sidebar and its Manage modal): hovering the
// Settings button peeks this as a narrow pane beside the page (`peek`, closed when the mouse
// leaves); clicking it, or the hotkey, opens the full modal (`modal`: a section list on the
// left, Manage's size), which takes the keyboard while open.
export function SettingsPane({ variant, hoverHandlers, onClosePeek }: {
  variant: 'peek' | 'modal';
  hoverHandlers?: { onMouseEnter: () => void; onMouseLeave: () => void };
  onClosePeek?: () => void;
}) {
  const paneResize = usePaneWidth('settings-pane', { edge: 'left', min: 280, max: 720 });
  const navResize  = usePaneWidth('settings-nav', { edge: 'right', min: 140, max: 360 });
  const { isAndroid } = usePlatform();
  const closeSettings = useUIStore((s) => s.closeSettings);
  const openSettings  = useUIStore((s) => s.openSettings);
  const activeView    = useUIStore((s) => s.activeView);
  const [sectionId, setSectionId] = useState<SettingsSectionId>(() =>
    activeView === 'tasks' || activeView === 'notes' || activeView === 'calendar' ? activeView : 'appearance');
  const close = variant === 'peek' ? (onClosePeek ?? (() => {})) : closeSettings;

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

  useEscapeClose(() => { if (!listening) close(); });

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

  const speechLanguage          = useSettingsStore((s) => s.speechLanguage);
  const setSpeechLanguage       = useSettingsStore((s) => s.setSpeechLanguage);

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
  const hideBlockedTasks        = useSettingsStore((s) => s.hideBlockedTasks);
  const toggleHideBlockedTasks  = useSettingsStore((s) => s.toggleHideBlockedTasks);
  const stickyHeadings          = useSettingsStore((s) => s.stickyHeadings);
  const dictionaryHighlight     = useSettingsStore((s) => s.dictionaryHighlight);
  const linkSuggestions         = useSettingsStore((s) => s.linkSuggestions);
  const setLinkSuggestions      = useSettingsStore((s) => s.setLinkSuggestions);
  const noteColorBars           = useSettingsStore((s) => s.noteColorBars);
  const setNoteColorBars        = useSettingsStore((s) => s.setNoteColorBars);
  const noteColorHeadings       = useSettingsStore((s) => s.noteColorHeadings);
  const toggleNoteColorHeadings = useSettingsStore((s) => s.toggleNoteColorHeadings);
  const mathSlash               = useSettingsStore((s) => s.mathSlash);
  const setMathSlash            = useSettingsStore((s) => s.setMathSlash);
  const toggleDictionaryHighlight = useSettingsStore((s) => s.toggleDictionaryHighlight);
  const toggleStickyHeadings    = useSettingsStore((s) => s.toggleStickyHeadings);

  const shadePastDays              = useSettingsStore((s) => s.shadePastDays);
  const shadeWeekends              = useSettingsStore((s) => s.shadeWeekends);
  const weekendShadeColor          = useSettingsStore((s) => s.weekendShadeColor);
  const strikethroughPastDays      = useSettingsStore((s) => s.strikethroughPastDays);
  const toggleShadePastDays        = useSettingsStore((s) => s.toggleShadePastDays);
  const toggleShadeWeekends        = useSettingsStore((s) => s.toggleShadeWeekends);
  const setWeekendShadeColor       = useSettingsStore((s) => s.setWeekendShadeColor);
  const toggleStrikethroughPastDays = useSettingsStore((s) => s.toggleStrikethroughPastDays);

  // Every section, in order. `here`: shown in the hover peek only in that app section (the full
  // modal lists them all, so any section's settings can be reached from anywhere).
  const appearanceSection = (
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
  );

  const voiceSection = (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Voice dictation</h3>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Language</span>
                <span className={styles.settingDesc}>
                  Click into any text field and press {getEffectiveBinding('action-dictate').primary ?? 'Ctrl+D'} to dictate.
                </span>
              </div>
              <select
                className={styles.timezoneSelect}
                value={speechLanguage}
                onChange={(e) => setSpeechLanguage(e.target.value)}
              >
                <option value="system">System ({navigator.language})</option>
                {SPEECH_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>
          </section>
  );

  const tasksSection = (
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

              <SettingRow
                name="Move blocked tasks out of the list"
                desc="Tasks waiting on another task go in a collapsed group at the bottom, instead of staying in place greyed out"
              >
                <Toggle on={hideBlockedTasks} onToggle={toggleHideBlockedTasks} label="Toggle moving blocked tasks out of the list" />
              </SettingRow>
            </section>
  );

  const notesSection = (
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>{LABELS.noteHeadings.settingsSection}</h3>

              <SettingRow name={LABELS.noteHeadings.sticky} desc={LABELS.noteHeadings.stickyDesc}>
                <Toggle on={stickyHeadings} onToggle={toggleStickyHeadings} label={LABELS.noteHeadings.sticky} />
              </SettingRow>

              <SettingRow name={LABELS.glossary.linkSuggestions} desc={LABELS.glossary.linkSuggestionsDesc}>
                <div className={styles.themeToggle} role="group" aria-label={LABELS.glossary.linkSuggestions}>
                  {LINK_SUGGESTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`${styles.themeBtn} ${linkSuggestions === v ? styles.themeBtnActive : ''}`}
                      aria-pressed={linkSuggestions === v}
                      onClick={() => setLinkSuggestions(v)}
                    >{LABELS.glossary.linkSuggestionModes[v]}</button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow name={LABELS.dictionary.setting} desc={LABELS.dictionary.settingDesc}>
                <Toggle on={dictionaryHighlight} onToggle={toggleDictionaryHighlight} label={LABELS.dictionary.setting} />
              </SettingRow>

              <SettingRow name={LABELS.noteColors.bars} desc={LABELS.noteColors.barsDesc}>
                <div className={styles.themeToggle} role="group" aria-label={LABELS.noteColors.bars}>
                  {NOTE_COLOR_BARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`${styles.themeBtn} ${noteColorBars === v ? styles.themeBtnActive : ''}`}
                      aria-pressed={noteColorBars === v}
                      onClick={() => setNoteColorBars(v)}
                    >{LABELS.noteColors.barStyles[v]}</button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow name={LABELS.noteColors.headings} desc={LABELS.noteColors.headingsDesc}>
                <Toggle on={noteColorHeadings} onToggle={toggleNoteColorHeadings} label={LABELS.noteColors.headings} />
              </SettingRow>

              <SettingRow name={LABELS.mathSlash.setting} desc={LABELS.mathSlash.desc}>
                <div className={styles.themeToggle} role="group" aria-label={LABELS.mathSlash.setting}>
                  {(['fraction', 'slash'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`${styles.themeBtn} ${mathSlash === v ? styles.themeBtnActive : ''}`}
                      aria-pressed={mathSlash === v}
                      onClick={() => setMathSlash(v)}
                    >{LABELS.mathSlash[v]}</button>
                  ))}
                </div>
              </SettingRow>
            </section>
  );

  const calendarSection = (
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
  );

  const hotkeysSection = (
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
                              aria-label="Reset this hotkey to its default"
                            ><ResetIcon /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </section>
  );

  const sections: { id: SettingsSectionId; label: string; here?: AppView; node: React.ReactNode }[] = [
    { id: 'appearance', label: LABELS.settings.sections.appearance, node: appearanceSection },
    { id: 'voice',      label: LABELS.settings.sections.voice,      node: voiceSection },
    { id: 'typing',     label: LABELS.typingShortcuts.section,        node: <TypingShortcutsSection /> },
    { id: 'converters', label: LABELS.converters.settings.heading,   node: <ConvertersSection /> },
    ...(isAndroid ? [{ id: 'notifications' as const, label: LABELS.settings.sections.notifications, node: <NotificationsSection /> }] : []),
    { id: 'storage',    label: LABELS.settings.sections.storage,    node: <StorageSection /> },
    { id: 'tasks',      label: LABELS.settings.sections.tasks,      here: 'tasks',    node: tasksSection },
    { id: 'notes',      label: LABELS.noteHeadings.settingsSection, here: 'notes',    node: notesSection },
    { id: 'calendar',   label: LABELS.settings.sections.calendar,   here: 'calendar', node: calendarSection },
    { id: 'hotkeys',    label: LABELS.settings.sections.hotkeys,    node: hotkeysSection },
  ];

  if (variant === 'peek') {
    return (
      <aside style={paneResize.style} className={styles.pane} {...hoverHandlers} aria-label={LABELS.settings.title}>
        {paneResize.handle && <ResizeHandle {...paneResize.handle} />}
        <header className={styles.header}>
          <span className={styles.heading}>{LABELS.settings.title}</span>
          <button className={styles.expandBtn} onClick={openSettings}>{LABELS.settings.openFull}</button>
        </header>
        <div className={styles.body}>
          {sections.filter((x) => !x.here || x.here === activeView).map((x) => (
            <Fragment key={x.id}>{x.node}</Fragment>
          ))}
        </div>
      </aside>
    );
  }

  const shown = sections.find((x) => x.id === sectionId) ?? sections[0];
  return (
    <div className={styles.modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={LABELS.settings.title}>
        <header className={styles.modalHeader}>
          <span className={styles.modalTitle}>{LABELS.settings.title}</span>
          <button className={styles.closeBtn} onClick={closeSettings} aria-label={LABELS.settings.close}><CloseIcon /></button>
        </header>
        <div className={styles.modalBody}>
          <nav style={navResize.style} className={styles.nav} aria-label={LABELS.settings.title}>
            {navResize.handle && <ResizeHandle {...navResize.handle} />}
            {sections.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`${styles.navItem} ${x.id === shown.id ? styles.navItemActive : ''}`}
                aria-current={x.id === shown.id ? 'true' : undefined}
                onClick={() => setSectionId(x.id)}
              >{x.label}</button>
            ))}
          </nav>
          <div className={styles.modalContent}>{shown.node}</div>
        </div>
      </div>
    </div>
  );
}
