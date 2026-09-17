import { useState } from 'react';
import { useNoteStore } from '@/store/noteStore';
import { useUIStore } from '@/store/uiStore';
import { BUILTIN_TAGS, type BuiltinTag } from '../NoteEditor/builtinTags';
import { getStructuredTagType } from '@/config/structuredTagTypes';
import type { Note, NoteTag, StructuredTagEntry } from '@/types/notes';
import type { NoteTagId } from '@/types';
import styles from './TagView.module.css';

type SortMode = 'type' | 'alpha' | 'count';

// ── Helpers ───────────────────────────────────────────────────────────────

function getTaggedSegments(content: string, tagId: string): string[] {
  const segments: string[] = [];
  function traverse(node: { text?: string; marks?: { type: string; attrs?: { tagId?: string } }[]; content?: unknown[] }) {
    if (node.marks?.some((m) => m.type === 'noteTag' && m.attrs?.tagId === tagId) && node.text) {
      segments.push(node.text);
    }
    (node.content as typeof node[] | undefined)?.forEach(traverse);
  }
  try {
    const doc = JSON.parse(content);
    doc.content?.forEach(traverse);
  } catch { /* ignore */ }
  return segments;
}

function getNotebookPath(note: Note, tags: Record<NoteTagId, NoteTag>): string[] {
  for (const tagId of note.tagIds) {
    const path: string[] = [];
    let curr: NoteTag | null = tags[tagId as NoteTagId] ?? null;
    while (curr) {
      path.unshift(curr.name);
      curr = curr.parentTagId ? (tags[curr.parentTagId] ?? null) : null;
    }
    if (path.length > 0) return path;
  }
  return ['Uncategorized'];
}

function getContentPreview(content: string, maxChars = 120): string {
  try {
    const doc = JSON.parse(content);
    let text = '';
    function extract(node: { text?: string; content?: unknown[] }) {
      if (node.text) text += node.text;
      (node.content as typeof node[] | undefined)?.forEach(extract);
    }
    doc.content?.forEach(extract);
    return text.trim().slice(0, maxChars) + (text.trim().length > maxChars ? '…' : '');
  } catch { return ''; }
}

// ── Data model for display ────────────────────────────────────────────────

interface NoteEntry {
  noteId:   string;
  title:    string;
  segments: string[];  // actual tagged text snippets
  preview:  string;    // content preview for org tags
  structuredEntries?: StructuredTagEntry[];  // structured tag types (Acronym, etc.) only
}

interface LocationGroup {
  pathKey:  string;
  path:     string[];
  entries:  NoteEntry[];
}

interface TagGroup {
  id:        string;
  name:      string;
  icon:      string;
  color:     string;
  isBuiltin: boolean;
  locations: LocationGroup[];
  total:     number;
}

// ── Main component ────────────────────────────────────────────────────────

export function TagView() {
  const closeNoteTagView    = useUIStore((s) => s.closeNoteTagView);
  const noteTagViewTagIds   = useUIStore((s) => s.noteTagViewTagIds);
  const openNote            = useUIStore((s) => s.openNote);
  const closeNote           = useUIStore((s) => s.closeNote);
  const setNoteTagViewReturn = useUIStore((s) => s.setNoteTagViewReturn);
  const notesRecord         = useNoteStore((s) => s.notes);
  const noteTagsRecord      = useNoteStore((s) => s.noteTags);
  const structuredTagEntries = useNoteStore((s) => s.structuredTagEntries);

  const [sort, setSort]           = useState<SortMode>('type');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const notes = Object.values(notesRecord);

  // Build tag groups with location-grouped entries
  const groups: TagGroup[] = noteTagViewTagIds.map((tagId) => {
    const builtin = BUILTIN_TAGS.find((t: BuiltinTag) => t.id === tagId);

    if (builtin) {
      const structuredType = getStructuredTagType(builtin.typeKey);

      // Structured tag type (Acronym, etc.): browse the separate entries directly rather
      // than raw marked text — each entry carries its own fields (e.g. "stands for"),
      // which a plain text snippet can't show.
      if (structuredType) {
        const entries = Object.values(structuredTagEntries).filter((e) => e.tagId === tagId);
        const noteMap = new Map<string, NoteEntry>();
        entries.forEach((entry) => {
          const note = notesRecord[entry.noteId as import('@/types').NoteId];
          const existing = noteMap.get(entry.noteId);
          if (existing) { existing.structuredEntries!.push(entry); return; }
          noteMap.set(entry.noteId, {
            noteId: entry.noteId, title: note?.title || '(Untitled)',
            segments: [], preview: '', structuredEntries: [entry],
          });
        });

        const byLocation = new Map<string, LocationGroup>();
        noteMap.forEach((entry, noteId) => {
          const note = notesRecord[noteId as import('@/types').NoteId];
          if (!note) return;
          const path = getNotebookPath(note, noteTagsRecord);
          const key = path.join(' > ');
          if (!byLocation.has(key)) byLocation.set(key, { pathKey: key, path, entries: [] });
          byLocation.get(key)!.entries.push(entry);
        });

        const locations = [...byLocation.values()].sort((a, b) => a.pathKey.localeCompare(b.pathKey));
        const total = locations.reduce((sum, l) => sum + l.entries.length, 0);
        return { id: tagId, name: builtin.name, icon: builtin.icon, color: builtin.color, isBuiltin: true, locations, total };
      }

      // Semantic tag: find notes with this mark + extract text
      const noteMap = new Map<string, NoteEntry>();
      notes.forEach((note) => {
        const segs = getTaggedSegments(note.content, tagId);
        if (segs.length > 0) {
          noteMap.set(note.id, { noteId: note.id, title: note.title || '(Untitled)', segments: segs, preview: '' });
        }
      });

      const byLocation = new Map<string, LocationGroup>();
      noteMap.forEach((entry, noteId) => {
        const note = notesRecord[noteId as import('@/types').NoteId];
        if (!note) return;
        const path = getNotebookPath(note, noteTagsRecord);
        const key = path.join(' > ');
        if (!byLocation.has(key)) byLocation.set(key, { pathKey: key, path, entries: [] });
        byLocation.get(key)!.entries.push(entry);
      });

      const locations = [...byLocation.values()].sort((a, b) => a.pathKey.localeCompare(b.pathKey));
      const total = locations.reduce((sum, l) => sum + l.entries.length, 0);

      return { id: tagId, name: builtin.name, icon: builtin.icon, color: builtin.color, isBuiltin: true, locations, total };
    }

    // Organizational tag: notes by .tagIds
    const userTag = noteTagsRecord[tagId as NoteTagId];
    if (userTag) {
      const matching = notes.filter((n) => n.tagIds.includes(tagId as never));
      const entry: NoteEntry[] = matching.map((n) => ({
        noteId: n.id, title: n.title || '(Untitled)',
        segments: [], preview: getContentPreview(n.content),
      }));
      const path = (() => {
        const p: string[] = [];
        let curr: NoteTag | null = userTag;
        while (curr) { p.unshift(curr.name); curr = curr.parentTagId ? noteTagsRecord[curr.parentTagId] : null; }
        return p;
      })();
      const locations = entry.length > 0 ? [{ pathKey: path.join(' > '), path, entries: entry }] : [];
      return { id: tagId, name: userTag.name, icon: userTag.icon ?? '📁', color: userTag.color ?? '#6b7280', isBuiltin: false, locations, total: entry.length };
    }
    return null;
  }).filter(Boolean) as TagGroup[];

  const sorted = [...groups].sort((a, b) => {
    if (sort === 'type') return (a.isBuiltin ? 0 : 1) - (b.isBuiltin ? 0 : 1);
    if (sort === 'alpha') return a.name.localeCompare(b.name);
    if (sort === 'count') return b.total - a.total;
    return 0;
  });

  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleNoteClick = (noteId: string) => {
    const returnTo = [...noteTagViewTagIds];
    closeNote();
    closeNoteTagView();
    openNote(noteId);
    setNoteTagViewReturn(returnTo);
  };

  const totalUnique = [...new Set(groups.flatMap((g) => g.locations.flatMap((l) => l.entries.map((e) => e.noteId))))].length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Tagged view</span>
          <span className={styles.subtitle}>{totalUnique} note{totalUnique !== 1 ? 's' : ''} · {groups.length} tag{groups.length !== 1 ? 's' : ''}</span>
        </div>
        <div className={styles.headerRight}>
          <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="type">Sort: by type</option>
            <option value="alpha">Sort: A–Z</option>
            <option value="count">Sort: most notes</option>
          </select>
          <button className={styles.closeBtn} onClick={closeNoteTagView} title="Return to Chronicle (Esc)">×</button>
        </div>
      </div>

      <div className={styles.body}>
        {sorted.length === 0 ? (
          <div className={styles.empty}>No tagged content found. Tag text with Ctrl+Space in the editor.</div>
        ) : (
          sorted.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            return (
              <div key={group.id} className={styles.group}>
                <button
                  className={styles.groupHeader}
                  onClick={() => toggle(group.id)}
                  style={{ borderLeft: `4px solid ${group.color}` }}
                >
                  <span className={styles.groupToggle}>{isCollapsed ? '▸' : '▾'}</span>
                  <span className={styles.groupIcon}>{group.icon}</span>
                  <span className={styles.groupName}>{group.name}</span>
                  <span className={styles.groupCount}>{group.total}</span>
                </button>

                {!isCollapsed && (
                  <div className={styles.groupBody}>
                    {group.locations.length === 0 ? (
                      <div className={styles.groupEmpty}>No tagged content yet</div>
                    ) : (
                      group.locations.map((loc) => (
                        <div key={loc.pathKey} className={styles.locationGroup}>
                          {/* Location breadcrumb header */}
                          <div className={styles.locationHeader}>
                            {loc.path.map((part, i) => (
                              <span key={i}>
                                {i > 0 && <span className={styles.locationSep}> / </span>}
                                <span className={styles.locationPart}>{part}</span>
                              </span>
                            ))}
                          </div>

                          {loc.entries.map((entry) => (
                            <div key={entry.noteId} className={styles.noteEntry}>
                              <button className={styles.noteTitle} onClick={() => handleNoteClick(entry.noteId)}>
                                {entry.title}
                              </button>

                              {/* Structured tag type (Acronym, etc.): show term + fields */}
                              {entry.structuredEntries?.map((se) => (
                                <div key={se.id} className={styles.segment} onClick={() => handleNoteClick(entry.noteId)}>
                                  <span className={styles.segmentQuote}>{se.term}</span>
                                  {Object.entries(se.fields)
                                    .filter(([, v]) => v)
                                    .map(([fieldId, value]) => (
                                      <span key={fieldId}> — {String(value)}</span>
                                    ))}
                                </div>
                              ))}

                              {/* Semantic: show actual tagged text snippets */}
                              {entry.segments.map((seg, si) => (
                                <div key={si} className={styles.segment} onClick={() => handleNoteClick(entry.noteId)}>
                                  <span className={styles.segmentQuote}>"</span>
                                  <span>{seg}</span>
                                  <span className={styles.segmentQuote}>"</span>
                                </div>
                              ))}

                              {/* Org tag: show content preview */}
                              {entry.segments.length === 0 && entry.preview && (
                                <div className={styles.preview} onClick={() => handleNoteClick(entry.noteId)}>
                                  {entry.preview}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
