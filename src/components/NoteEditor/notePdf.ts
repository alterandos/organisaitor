import { Capacitor } from '@capacitor/core';
import type { EditorView } from '@tiptap/pm/view';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { isNoteLocked, noteView } from '@/services/noteSecrets';
import { flushOpenNoteEditors, liveNote, liveNoteFor } from '@/services/liveNoteEditor';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { alertDialog } from '@/components/ConfirmDialog/dialogs';
import { LABELS } from '@/config/labels';
import { log } from '@/utils/log';
import type { NoteId } from '@/types';

// Export a note as PDF (2026-10-22): the open editor's own drawing is copied into a print-only
// layer and the browser's print dialog (Save as PDF) prints just that, so every block, card, chart
// and formula looks as it does on screen. Printed in the light theme; hover controls, the margin
// column and the cursor are left out, and folded headings are printed open. Not on Android, whose
// WebView has no print dialog (gap F34).

export const canExportPdf = (): boolean => Capacitor.getPlatform() !== 'android' && typeof window.print === 'function';

// Controls drawn into the editor that mean nothing on paper.
const NOT_PRINTED = [
  '[data-block-tools]', '[data-margin-column]', '[data-autolink-chip]', '[data-offer-anchor]',
  '[data-timeline-add]', '[data-heading-fold]', '[data-heading-fold-more]', '.ProseMirror-gapcursor',
].join(',');

export interface PrintRootOptions {
  title: string | null;
  subtitle?: string | null;
  // The formula as static markup, for each maths field (whose drawing is in a shadow root a copy loses).
  mathMarkup?: (latex: string) => string;
}

// The print layer for `content` (the editor's content element): a copy of it inside copies of the
// wrappers around it (so the note's scoped styles still match), with the title above.
export function buildPrintRoot(content: HTMLElement, opts: PrintRootOptions): HTMLElement {
  const copy = content.cloneNode(true) as HTMLElement;

  // What a copy doesn't carry over: typed values, canvases, maths.
  const pairs = <T extends Element>(sel: string) => {
    const a = Array.from(content.querySelectorAll<T>(sel));
    const b = Array.from(copy.querySelectorAll<T>(sel));
    return a.map((el, i) => [el, b[i]] as const).filter(([, c]) => !!c);
  };
  for (const [from, to] of pairs<HTMLInputElement>('input')) to.setAttribute('value', from.value);
  for (const [from, to] of pairs<HTMLTextAreaElement>('textarea')) to.textContent = from.value;
  for (const [from, to] of pairs<HTMLSelectElement>('select')) {
    Array.from(to.options).forEach((o, i) => o.toggleAttribute('selected', i === from.selectedIndex));
  }
  for (const [from, to] of pairs<HTMLCanvasElement>('canvas')) {
    try {
      const img = document.createElement('img');
      img.src = from.toDataURL('image/png');
      img.className = from.className;
      img.style.width = `${from.clientWidth || from.width}px`;
      img.style.height = `${from.clientHeight || from.height}px`;
      to.replaceWith(img);
    } catch (e) { log.warn('notePdf', 'a canvas could not be copied', e); }
  }
  if (opts.mathMarkup) {
    for (const [from, to] of pairs<HTMLElement & { value?: string }>('math-field')) {
      const span = document.createElement('span');
      span.setAttribute('data-print-math', '');
      span.innerHTML = opts.mathMarkup(from.value ?? from.textContent ?? '');
      to.replaceWith(span);
    }
  }

  copy.querySelectorAll(NOT_PRINTED).forEach((el) => el.remove());
  copy.querySelectorAll('[data-fold-hidden]').forEach((el) => el.removeAttribute('data-fold-hidden'));
  copy.querySelectorAll('[data-folded]').forEach((el) => el.removeAttribute('data-folded'));
  copy.querySelectorAll('.ProseMirror-selectednode').forEach((el) => el.classList.remove('ProseMirror-selectednode'));
  [copy, ...Array.from(copy.querySelectorAll('[contenteditable]'))].forEach((el) => el.removeAttribute('contenteditable'));

  // The wrappers between the content and the page, empty, so selectors like `.editorArea .editor h1` match.
  let inner: HTMLElement = copy;
  for (let el = content.parentElement; el && el !== document.body && el.id !== 'root'; el = el.parentElement) {
    const shell = el.cloneNode(false) as HTMLElement;
    shell.removeAttribute('id');
    shell.style.removeProperty('zoom');
    shell.setAttribute('data-print-shell', '');
    shell.append(inner);
    inner = shell;
  }

  const root = document.createElement('div');
  root.setAttribute('data-print-root', '');
  if (opts.title) {
    const h = document.createElement('h1');
    h.setAttribute('data-print-title', '');
    h.textContent = opts.title;
    root.append(h);
  }
  if (opts.subtitle) {
    const p = document.createElement('p');
    p.setAttribute('data-print-subtitle', '');
    p.textContent = opts.subtitle;
    root.append(p);
  }
  root.append(inner);
  return root;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The note's editor, opening the note first if it isn't showing.
async function editorFor(noteId: string): Promise<{ view: EditorView; tabId: string | null } | null> {
  let live = liveNoteFor(noteId);
  if (!live) {
    const ui = useUIStore.getState();
    if (ui.activeView !== 'notes') ui.setActiveView('notes');
    ui.openNote(noteId);
    for (let i = 0; i < 60 && !live; i++) { await wait(50); live = liveNoteFor(noteId); }
    if (live) await wait(300);   // let its blocks draw
  }
  return live && !live.view.isDestroyed ? { view: live.view, tabId: live.tabId } : null;
}

// The page printed: a hidden frame holding only the note and the app's styles, in the light theme.
// It stays until the dialog is done (afterprint), or until the next export: in the desktop app's
// WebView2, print() returns before the dialog has read the page, so taking it away on a timer left
// the PDF with only the title (found 2026-10-22).
let frame: HTMLIFrameElement | null = null;

async function printInFrame(root: HTMLElement, title: string): Promise<void> {
  frame?.remove();
  const f = document.createElement('iframe');
  frame = f;
  f.setAttribute('data-print-frame', '');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  // The frame loads its own page before anything is put in it: an empty frame written into at once
  // can be replaced by its first load a moment later in WebView2, losing what was written.
  const loaded = new Promise<void>((r) => f.addEventListener('load', () => r(), { once: true }));
  f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
  document.body.append(f);
  await Promise.race([loaded, wait(3000)]);
  const doc = f.contentDocument;
  const win = f.contentWindow;
  if (!doc?.body || !win) throw new Error('The print frame could not be made.');
  doc.documentElement.setAttribute('data-theme', 'light');
  doc.documentElement.setAttribute('data-printing', '');
  doc.documentElement.lang = document.documentElement.lang;
  doc.title = title;
  const loads: Promise<unknown>[] = [];
  for (const el of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    const copy = doc.importNode(el, true) as HTMLElement;
    if (copy.tagName === 'LINK') loads.push(new Promise((r) => { copy.addEventListener('load', r); copy.addEventListener('error', r); }));
    doc.head.append(copy);
  }
  doc.body.append(doc.importNode(root, true));
  const inFrame = () => !!f.contentDocument?.querySelector('[data-print-root] .ProseMirror');
  const stages = `copy ${root.querySelector('.ProseMirror') ? 'yes' : 'no'}, written ${inFrame() ? 'yes' : 'no'}`;
  await Promise.race([Promise.all(loads), wait(4000)]);
  await Promise.race([doc.fonts?.ready, wait(2000)]);
  await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
  const now = f.contentDocument;
  const problem = now ? unreadable(now, root.querySelector('.ProseMirror')?.textContent ?? '') : 'the frame has no page';
  if (problem) {
    const detail = `${stages}, same page ${now === doc ? 'yes' : 'no'}: ${problem}`;
    log.warn('notePdf', 'the copy to print came out unreadable', detail);
    f.remove();
    if (frame === f) frame = null;
    await alertDialog(LABELS.notePdf.unreadable(detail));
    return;
  }
  win.addEventListener('afterprint', () => setTimeout(() => { if (frame === f) { f.remove(); frame = null; } }, 1000), { once: true });
  win.focus();
  win.print();
}

// Why the copy in the frame wouldn't show the note's text, or null when it does: the copy's size and
// visible text, and how each wrapper around it is laid out (so a report says what hid it).
function unreadable(doc: Document, expected: string): string | null {
  const pm = doc.querySelector<HTMLElement>('[data-print-root] .ProseMirror');
  const want = expected.replace(/\s+/g, '').length;
  if (!pm) return 'no editor content in the copy';
  const height = Math.round(pm.getBoundingClientRect().height);
  const shown = (pm.innerText ?? '').replace(/\s+/g, '').length;
  if (height >= 4 && (want === 0 || shown >= Math.min(20, want / 2))) return null;
  const view = doc.defaultView;
  const chain: string[] = [];
  for (let el: HTMLElement | null = pm; el && el !== doc.body; el = el.parentElement) {
    const cs = view?.getComputedStyle(el);
    const name = (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()).replace(/^_|_[a-z0-9]+_\d+$/g, '');
    chain.push(`${name}[${cs?.display} h${Math.round(el.getBoundingClientRect().height)} ${cs?.overflow} o${cs?.opacity} ${cs?.visibility} ${cs?.color}]`);
  }
  return `height ${height}px, text ${shown}/${want}; ${chain.join(' < ')}`;
}

let busy = false;

export async function exportNoteAsPdf(noteId: string): Promise<void> {
  if (busy || !canExportPdf()) return;
  const raw = useNoteStore.getState().notes[noteId as NoteId];
  if (!raw) return;
  const L = LABELS.notePdf;
  if (isNoteLocked(raw)) { await alertDialog(L.locked); return; }
  busy = true;
  const html = document.documentElement;
  const theme = html.getAttribute('data-theme');
  try {
    flushOpenNoteEditors();
    const live = await editorFor(noteId);
    const content = live?.view.dom.parentElement;
    if (!live || !content) { await alertDialog(L.failed); return; }

    const n = noteView(raw);
    const title = n.title.trim() || LABELS.mobileNotes.untitled;
    const tabName = live.tabId ? n.tabs.find((t) => t.id === live.tabId)?.name ?? null : null;
    const first = live.view.state.doc.firstChild?.firstChild;
    const startsWithTitle = first?.type.name === 'noteTitle' && first.textContent.trim() === title;

    let mathMarkup: PrintRootOptions['mathMarkup'];
    if (content.querySelector('math-field')) {
      const [m] = await Promise.all([import('mathlive'), import('mathlive/static.css')]);
      mathMarkup = (latex) => m.convertLatexToMarkup(latex);
    }

    // Charts are copied as pictures, so in the dark theme they're redrawn light first (their
    // animation takes 300 ms) and the theme put back straight after the copy.
    const darkCharts = theme === 'dark' && !!content.querySelector('canvas');
    if (darkCharts) { html.setAttribute('data-theme', 'light'); await wait(600); }
    let root: HTMLElement;
    try {
      root = buildPrintRoot(content, { title: startsWithTitle ? null : title, subtitle: tabName, mathMarkup });
    } finally {
      if (darkCharts) html.setAttribute('data-theme', 'dark');
    }
    await printInFrame(root, title);
  } catch (e) {
    log.error('notePdf', 'export failed', e);
    await alertDialog(L.failed);
  } finally {
    busy = false;
  }
}

registerContextMenuProvider({
  id: 'note-row.export-pdf',
  kind: 'note-row',
  order: 60,
  items: (_ctx, scope) => {
    const id = (scope.data as { noteId?: string } | undefined)?.noteId;
    return id && canExportPdf() ? [{ id: 'export-pdf', label: LABELS.notePdf.menu, run: () => exportNoteAsPdf(id) }] : [];
  },
});

registerContextMenuProvider({
  id: 'note-editor.export-pdf',
  kind: 'note-editor',
  order: 210,
  items: () => {
    const open = liveNote();
    return open && canExportPdf() ? [{ id: 'export-pdf', label: LABELS.notePdf.menu, run: () => exportNoteAsPdf(open.noteId) }] : [];
  },
});
