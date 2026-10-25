// @vitest-environment jsdom
// The demo account (demoAccount.ts) stays restorable: every note reads with the editor's real
// schema, and every link in it leads somewhere. With DEMO_OUT set to a file path it also writes
// the demo as a backup file (DEMO_BASE=YYYY-MM-DD picks the day it starts from; default today):
//   $env:DEMO_OUT="organisaitor-demo.json"; npx vitest run src/demo/demoAccount.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { getSchema } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { glossaryEntries } from '@/services/glossary';
import { buildBackupSnapshot } from '@/utils/backupExport';
import { PERSISTED_STORAGE_KEYS } from '@/config/backup';
import { NOTE_BLOCK_NODES } from '@/components/NoteEditor/blockNodes';
import { buildDemoAccount, DEMO_BACKUP_KEYS } from './demoAccount';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import type { CrossAppRefType } from '@/types';

// The note editor's schema: from the very list NoteEditor.tsx builds its editor with.
const schema: Schema = getSchema(noteEditorExtensions({ noteEncrypted: () => null, linkClass: '' }));

// Node-only (fs, process), so tsconfig.app.json leaves it out of the app's type check.
const env = process.env;
const base = env.DEMO_BASE ? new Date(`${env.DEMO_BASE}T09:00:00`) : (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; })();

let docs: { noteId: string; title: string; doc: PMNode }[] = [];

beforeAll(() => {
  buildDemoAccount(base);
  for (const note of Object.values(useNoteStore.getState().notes)) {
    for (const content of [note.content, ...note.tabs.map((t) => t.content)]) {
      docs.push({ noteId: note.id, title: note.title, doc: schema.nodeFromJSON(JSON.parse(content)) });
    }
  }
});
afterAll(() => { docs = []; });

const each = (fn: (node: PMNode, note: { noteId: string; title: string }) => void) =>
  docs.forEach(({ doc, ...note }) => doc.descendants((n) => { fn(n, note); return true; }));

describe('the demo account', () => {
  it('every note reads with the editor’s schema', () => {
    expect(docs.length).toBeGreaterThan(8);
    for (const { title, doc } of docs) expect(() => doc.check(), title).not.toThrow();
  });

  it('no attribute it sets is one the schema drops', () => {
    // ProseMirror ignores an attribute it doesn't know, so a misspelt one would vanish silently.
    const dropped: string[] = [];
    const walk = (given: Record<string, unknown>, kept: Record<string, unknown>, where: string) => {
      const attrs = (given.attrs ?? {}) as Record<string, unknown>;
      const keptAttrs = (kept.attrs ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(attrs)) if (!(k in keptAttrs)) dropped.push(`${where} ${given.type}.${k}`);
      ((given.marks ?? []) as Record<string, unknown>[]).forEach((m, i) => walk(m, ((kept.marks ?? []) as Record<string, unknown>[])[i] ?? {}, where));
      ((given.content ?? []) as Record<string, unknown>[]).forEach((c, i) => walk(c, ((kept.content ?? []) as Record<string, unknown>[])[i] ?? {}, where));
    };
    for (const note of Object.values(useNoteStore.getState().notes)) {
      for (const content of [note.content, ...note.tabs.map((t) => t.content)]) {
        const given = JSON.parse(content);
        walk(given, schema.nodeFromJSON(given).toJSON(), note.title);
      }
    }
    expect(dropped).toEqual([]);
  });

  it('uses every note block', () => {
    const used = new Set<string>();
    each((n) => { used.add(n.type.name); });
    // An embed and the glossary chip aren't in NOTE_BLOCK_NODES' sense of "a block you insert", but check them too.
    const missing = [...NOTE_BLOCK_NODES, 'noteEmbed', 'glossaryChip', 'mathInline', 'table', 'columnBlock'].filter((name) => !used.has(name));
    expect(missing).toEqual([]);
  });

  it('every link from a note leads to something that exists', () => {
    const { tasks } = useTaskStore.getState();
    const { events, reminders, deadlines } = useCalendarStore.getState();
    const { notes, structuredTagEntries } = useNoteStore.getState();
    const { lists } = useListStore.getState();
    const items: Partial<Record<CrossAppRefType, Record<string, unknown>>> = { task: tasks, event: events, reminder: reminders, deadline: deadlines, list: lists };
    const blockIds = new Map<string, Set<string>>();
    each((n, note) => { if (n.attrs.blockId) blockIds.set(note.noteId, (blockIds.get(note.noteId) ?? new Set()).add(n.attrs.blockId)); });
    const passageLinks = new Set<string>();
    const broken: string[] = [];
    const inNote = (noteId: string, blockId: string | null, what: string, title: string) => {
      if (!notes[noteId as never]) broken.push(`${title}: ${what} → missing note`);
      else if (blockId && !blockIds.get(noteId)?.has(blockId)) broken.push(`${title}: ${what} → missing passage ${blockId}`);
    };
    each((n, note) => {
      for (const m of n.marks) {
        if (m.type.name === 'artifactLink' && !items[m.attrs.targetType as CrossAppRefType]?.[m.attrs.targetId]) broken.push(`${note.title}: ${n.text}`);
        if (m.type.name === 'noteLink') inNote(m.attrs.noteId, m.attrs.blockId, n.text ?? '', note.title);
        if (m.type.name === 'conceptRef' && !structuredTagEntries[m.attrs.entryId]) broken.push(`${note.title}: term ${n.text}`);
        if (m.type.name === 'hubRef') passageLinks.add(m.attrs.linkId);
      }
      if (n.type.name === 'noteEmbed') inNote(n.attrs.noteId, n.attrs.blockId, 'embed', note.title);
      if ((n.type.name === 'glossaryCard' || n.type.name === 'glossaryChip') && !structuredTagEntries[n.attrs.entryId]) broken.push(`${note.title}: card ${n.attrs.entryId}`);
      if (n.type.name === 'hubLink' && n.attrs.kind === 'passage' && !passageLinks.has(n.attrs.linkId)) broken.push(`${note.title}: hub link ${n.attrs.linkId}`);
      if (n.type.name === 'inboxItem' && n.attrs.taskId && !tasks[n.attrs.taskId]) broken.push(`${note.title}: inbox task`);
    });
    expect(broken).toEqual([]);
  });

  it('every Glossary record is defined in its own note, so it shows in the Glossary', () => {
    expect(glossaryEntries().length).toBe(Object.keys(useNoteStore.getState().structuredTagEntries).length);
  });

  it('notes, tasks and the calendar link to each other both ways', () => {
    const { tasks } = useTaskStore.getState();
    const { events, deadlines, reminders } = useCalendarStore.getState();
    const toNotes = [...Object.values(tasks), ...Object.values(events), ...Object.values(deadlines), ...Object.values(reminders)]
      .filter((i) => i.crossAppRefs.some((r) => r.type === 'note'));
    expect(toNotes.length).toBeGreaterThan(8);
    // A scheduled task's own calendar entry, made by the store.
    expect(Object.values(tasks).filter((t) => t.calendarEventId && events[t.calendarEventId]).length).toBeGreaterThan(3);
  });

  it('writes a backup file when asked', async () => {
    useTaskStore.setState({});   // so every demo store has been persisted
    useCalendarStore.setState({});
    useNoteStore.setState({});
    useListStore.setState({});
    const snapshot = await buildBackupSnapshot();
    const backup: Record<string, unknown> = { exportedAt: snapshot.exportedAt, version: snapshot.version };
    for (const key of DEMO_BACKUP_KEYS) {
      expect(PERSISTED_STORAGE_KEYS).toContain(key);
      if (key in snapshot) backup[key] = snapshot[key];
    }
    for (const key of ['todo-app-storage', 'todo-calendar', 'notes-storage', 'lists-storage', 'todo-tracker']) expect(backup, key).toHaveProperty(key);
    if (env.DEMO_OUT) fs.writeFileSync(env.DEMO_OUT, JSON.stringify(backup, null, 2));
  });
});
