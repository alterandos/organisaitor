import { useMemo, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { addDaysToIso, formatDate, formatTime, todayIso } from '@/utils/date';
import { calendarItemsByDate, type CalDisplayItem } from '@/utils/calendarItems';
import { MiniDatePicker } from '@/components/MiniDatePicker/MiniDatePicker';
import { CalItemLine } from '@/components/CalendarView/CalItemLine';
import { CalendarItemHoverCard, type HoverCardItem } from '@/components/CalendarView/CalendarItemHoverCard';
import { DateCalcBody } from '@/components/DateCalculator/DateCalculator';
import { DisclosureIcon } from '@/components/Icons';
import type { AnchorBox } from '@/utils/floatingPlacement';
import styles from './CalendarPad.module.css';

const L = LABELS.calendarPad;
const AGENDA_DAYS = 7;

// The calendar pad (Alt+C, in the pad: uiStore.pad; the user, 2026-11-07): a much smaller calendar
// over whatever is open, to check a date while filling something in. Read only: a month with its
// busy days marked, the chosen day and the six after it (each item whole on hover), and the date
// calculator, whose answer is picked in the month. The items are the calendar's own
// (utils/calendarItems.ts), with its layers, and no Endeavour or tag filter.
export function CalendarPad() {
  const tasks = useTaskStore((s) => s.tasks);
  const collections = useTaskStore((s) => s.collections);
  const events = useCalendarStore((s) => s.events);
  const reminders = useCalendarStore((s) => s.reminders);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const schedules = useScheduleStore((s) => s.schedules);
  const trackerEntries = useTrackerStore((s) => s.entries);
  const layers = useSettingsStore((s) => s.calendarLayerVisibility);
  const clockFormat = useSettingsStore((s) => s.clockFormat);
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  const [calcOpen, setCalcOpen] = useState(false);
  const [hover, setHover] = useState<{ item: HoverCardItem; anchor: AnchorBox } | null>(null);

  // The month shown (with the days around it) and the agenda's week, in one range.
  const from = addDaysToIso(`${selected.slice(0, 7)}-01`, -7);
  const to = addDaysToIso(`${selected.slice(0, 7)}-01`, 45) > addDaysToIso(selected, AGENDA_DAYS) ? addDaysToIso(`${selected.slice(0, 7)}-01`, 45) : addDaysToIso(selected, AGENDA_DAYS);
  const byDate = useMemo(() => calendarItemsByDate(
    { tasks, events, reminders, deadlines, schedules, collections, trackerEntries }, from, to,
    { layers, endeavourScope: null, tagFilter: null, today },
  ), [tasks, events, reminders, deadlines, schedules, collections, trackerEntries, from, to, layers, today]);
  const marked = useMemo(() => new Set([...byDate.entries()].filter(([, list]) => list.length > 0).map(([d]) => d)), [byDate]);
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDaysToIso(selected, i));

  const showHover = (e: React.MouseEvent<HTMLElement>, item: CalDisplayItem, date: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    const links = item.kind === 'event' || item.kind === 'reminder' || item.kind === 'deadline' ? item.links : [];
    setHover({
      item: { kind: item.kind, id: item.id, title: item.title, typeIcon: item.typeIcon, flags: 'flags' in item ? item.flags : undefined, time: item.time, date, notes: item.notes, links, collectionId: item.collectionId },
      anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    });
  };
  const openCalendar = () => {
    const ui = useUIStore.getState();
    ui.setActiveView('calendar');
    ui.requestCalendarDate(selected);
  };

  return (
    <div className={styles.body}>
      <MiniDatePicker anchorDate={selected} onSelect={setSelected} marked={marked} />
      <div className={styles.bar}>
        {selected !== today && <button type="button" className={styles.link} onClick={() => setSelected(today)}>{L.today}</button>}
        <span className={styles.spacer} />
        <button type="button" className={styles.link} onClick={openCalendar}>{L.openCalendar}</button>
      </div>
      <section className={styles.agenda} aria-label={L.days(AGENDA_DAYS)} onMouseLeave={() => setHover(null)}>
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          return (
            <div key={d} className={styles.day}>
              <h3 className={`${styles.dayHead} ${d === today ? styles.today : ''}`}>{formatDate(`${d}T00:00:00`)}</h3>
              {list.length === 0 ? <p className={styles.nothing}>{L.nothing}</p> : list.map((item) => (
                <div key={`${item.kind}-${item.id}`} className={styles.item} onMouseEnter={(e) => showHover(e, item, d)} onMouseLeave={() => setHover(null)}>
                  <CalItemLine item={item} time={item.time && formatTime(item.time, clockFormat)} titleClassName={styles.itemTitle} />
                </div>
              ))}
            </div>
          );
        })}
      </section>
      <button type="button" className={styles.calcToggle} aria-expanded={calcOpen} onClick={() => setCalcOpen((o) => !o)}>
        <DisclosureIcon open={calcOpen} /> {L.calculator}
      </button>
      {calcOpen && <div className={styles.calc}><DateCalcBody onShow={setSelected} showLabel={L.showHere} /></div>}
      {hover && <CalendarItemHoverCard item={hover.item} anchor={hover.anchor} />}
    </div>
  );
}
