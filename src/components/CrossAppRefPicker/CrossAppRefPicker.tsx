import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNoteStore } from '@/store/noteStore';
import type { CrossAppRef, CrossAppRefType } from '@/types';
import type { NoteId } from '@/types/notes';
import styles from './CrossAppRefPicker.module.css';

interface Props {
  value:    CrossAppRef[];
  onChange: (next: CrossAppRef[]) => void;
  // If provided, clicking an existing chip's label navigates there (TaskPane — the task
  // already exists). Omitted in a create form (AddTaskModal) where navigating away would
  // just abandon the in-progress task.
  onNavigate?: (ref: CrossAppRef) => void;
}

// Note is the only wired target today; the rest mirror FloatingToolbar's "Create ▸" menu
// stubs so this picker's type row already reads as the eventual complete set — see
// BACKLOG.md "Cross-app built-in tag types" for what each of these needs once built.
const TYPE_OPTIONS: { type: CrossAppRefType; label: string; icon: string; enabled: boolean }[] = [
  { type: 'note',         label: 'Note',          icon: '📝', enabled: true  },
  { type: 'event',        label: 'Calendar item', icon: '📅', enabled: false },
  { type: 'listItem',     label: 'List item',     icon: '📃', enabled: false },
  { type: 'trackerEntry', label: 'Tracker entry', icon: '📊', enabled: false },
];

const ICON_BY_TYPE: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.type, t.icon]));

export function CrossAppRefPicker({ value, onChange, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const notesRecord = useNoteStore((s) => s.notes);

  // Portaled to document.body, position:fixed from the trigger's own rect — not rendered
  // in-place with position:absolute. This picker is meant to be embedded inside forms that
  // can themselves scroll (AddTaskModal's advanced section is a long, scrollable form): an
  // absolutely-positioned dropdown there still contributes to its scrollable ancestor's
  // scrollHeight, so closing it (e.g. the outside-mousedown handler below, firing as part of
  // a click that's *also* headed for a button further down the form) shrinks that
  // scrollHeight and the browser clamps/shifts the scroll position mid-click — the button
  // physically moves between the click's mousedown and mouseup, so the click lands on
  // whatever is now under the cursor instead. Confirmed via a live round-trip: clicking
  // AddTaskModal's submit button right after picking a note here silently did nothing,
  // because the mouseup actually landed on this picker's own chip row once the form
  // reflowed. Portaling removes it from the scrollable ancestor's layout entirely, matching
  // the same fix shape already used elsewhere in this app (NoteEditor's table hover
  // controls, LinkHoverPreview) for exactly this class of problem.
  const openDropdown = () => {
    const rect = addBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const DROPDOWN_WIDTH = 260;
      const ESTIMATED_HEIGHT = 220; // type row + search + up to ~8 results
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= ESTIMATED_HEIGHT + 8
        ? rect.bottom + 4
        : Math.max(8, rect.top - ESTIMATED_HEIGHT - 4); // flip above the trigger
      const left = Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - 8);
      setDropdownPos({ top, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase + stopImmediatePropagation, not bubble + stopPropagation: this picker is
    // meant to be embeddable inside modals (AddTaskModal) that have their own bubble-phase
    // document Escape listener already registered (before this dropdown ever opens, since the
    // modal mounts first) — a bubble-phase listener here would fire *after* the modal's, by
    // which point the whole modal has already closed. A capture-phase listener on `document`
    // always runs before any bubble-phase listener anywhere in the tree, regardless of mount
    // order, and stopImmediatePropagation (unlike stopPropagation) actually prevents that
    // later sibling listener on the same `document` target from running at all. Same fix
    // shape as CalendarSidePane/AddScheduleModal's Escape conflict (see CLAUDE.md) — found
    // here via a live round-trip (Escape closed the whole AddTaskModal, not just this
    // dropdown), not by inspection.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [open]);

  const linkedNoteIds = new Set(value.filter((r) => r.type === 'note').map((r) => r.id));
  const q = search.trim().toLowerCase();
  const noteResults = Object.values(notesRecord)
    .filter((n) => !linkedNoteIds.has(n.id))
    .filter((n) => !q || (n.title || '').toLowerCase().includes(q))
    .sort((a, b) => new Date(b.lastViewedAt ?? b.updatedAt).getTime() - new Date(a.lastViewedAt ?? a.updatedAt).getTime())
    .slice(0, 8);

  const addNote = (noteId: string) => {
    onChange([...value, { type: 'note', id: noteId }]);
    setSearch('');
  };

  const removeRef = (ref: CrossAppRef) => {
    onChange(value.filter((r) => !(r.type === ref.type && r.id === ref.id)));
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.chips}>
        {value.map((ref) => {
          const label = ref.type === 'note' ? (notesRecord[ref.id as NoteId]?.title || 'Untitled') : ref.id;
          const icon = ICON_BY_TYPE[ref.type] ?? '🔗';
          return (
            <span key={`${ref.type}:${ref.id}`} className={styles.chip}>
              {onNavigate ? (
                <button type="button" className={styles.chipLabel} onClick={() => onNavigate(ref)}>
                  {icon} {label}
                </button>
              ) : (
                <span className={styles.chipLabel}>{icon} {label}</span>
              )}
              <button type="button" className={styles.chipRemove} onClick={() => removeRef(ref)} aria-label="Remove link">×</button>
            </span>
          );
        })}
        <button
          ref={addBtnRef}
          type="button"
          className={styles.addBtn}
          onClick={() => (open ? setOpen(false) : openDropdown())}
        >+ Link</button>
      </div>

      {open && dropdownPos && createPortal(
        <div
          className={styles.dropdown}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={styles.typeRow}>
            {TYPE_OPTIONS.map((t) => (
              <span
                key={t.type}
                className={`${styles.typeChip} ${t.enabled ? styles.typeChipActive : styles.typeChipStub}`}
                title={t.enabled ? t.label : `${t.label} — coming soon`}
              >
                {t.icon} {t.label}{!t.enabled && ' (soon)'}
              </span>
            ))}
          </div>
          <input
            autoFocus
            className={styles.search}
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.results}>
            {noteResults.length === 0 ? (
              <div className={styles.empty}>{q ? 'No notes found' : 'No notes yet'}</div>
            ) : (
              noteResults.map((n) => (
                <button key={n.id} type="button" className={styles.result} onClick={() => addNote(n.id)}>
                  📝 {n.title || 'Untitled'}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
