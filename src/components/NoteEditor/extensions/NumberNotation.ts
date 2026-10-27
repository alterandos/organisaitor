import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { LABELS } from '@/config/labels';
import { cycleNotation, formatNumber, notationOf, notationReady, numberAt, numberForms, parseNumber, readyNumbersIn } from '@/utils/numberNotation';
import { objectTriggerStorage } from '../objects/NoteObjectTrigger';
import { typingOfferPlugin, type TypingOfferMatch } from './typingOffer';
import { openBlockPopover, popoverClass as pop } from './blockDesigns';
import own from './NumberNotation.module.css';
import { registerMarginSource, type MarginItem } from './MarginColumn';
import { NOTE_BLOCK_NODES } from '../blockNodes';
import type { NoteEditorMenuApi } from '../contextMenu';

// A number written another way (asked for 2026-10-23): 69000000000 → 69,000,000,000 → 6.9×10¹⁰ →
// 6.9E10. Ctrl+] / Ctrl+[ on a number steps through its forms (the rules: utils/numberNotation.ts),
// and right-click offers them all. Since 2026-10-26 (the user's ask) a number of seven or more
// digits, or one with a power of ten, is marked in the margin column (10ⁿ, always) and drawn as a
// light pill while hovered (a decoration, never stored), with a ▾ that lists its notations; and typing one, then a
// space, offers its scientific form (a typing offer, typingOffer.ts). In plain text the cursor touching a number is enough; inside a
// note block the number must be selected, since there those keys cycle the block's design
// (extensions/designCycle.ts, which this sits in front of). Each change is one undo step.

export function numberRange(state: EditorState): { from: number; to: number; text: string } | null {
  const { selection: sel } = state;
  const $from = sel.$from;
  if (!$from.parent.isTextblock || !sel.$to.sameParent($from)) return null;
  const start = $from.start();
  if (!sel.empty) {
    const text = state.doc.textBetween(sel.from, sel.to);
    return parseNumber(text) ? { from: sel.from, to: sel.to, text } : null;
  }
  for (let d = $from.depth; d > 0; d--) if (NOTE_BLOCK_NODES.has($from.node(d).type.name)) return null;
  const line = state.doc.textBetween(start, $from.end(), undefined, '￼');
  const at = numberAt(line, $from.parentOffset);
  return at ? { from: start + at.from, to: start + at.to, text: line.slice(at.from, at.to) } : null;
}

export function writeNumberAs(view: EditorView, range: { from: number; to: number }, text: string, keepSelected: boolean): void {
  const tr = closeHistory(view.state.tr.insertText(text, range.from, range.to));
  const end = range.from + text.length;
  tr.setSelection(keepSelected ? TextSelection.create(tr.doc, range.from, end) : TextSelection.create(tr.doc, end));
  view.dispatch(tr.scrollIntoView());
}

function cycle(view: EditorView, dir: 1 | -1): boolean {
  const range = numberRange(view.state);
  if (!range) return false;
  const next = cycleNotation(range.text, dir);
  if (!next) return false;
  writeNumberAs(view, range, next, !view.state.selection.empty);
  return true;
}

// ── The pill ─────────────────────────────────────────────────────────────────

function decorate(state: EditorState): DecorationSet {
  const decos: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    node.forEach((child, offset) => {
      if (!child.isText || child.marks.some((m) => m.type.spec.code)) return;
      const start = pos + 1 + offset;
      for (const r of readyNumbersIn(child.text ?? '')) decos.push(Decoration.inline(start + r.from, start + r.to, { 'data-number-ready': '' }));
    });
    return false;
  });
  return DecorationSet.create(state.doc, decos);
}

const pillKey = new PluginKey<DecorationSet>('numberPills');

// Always shown: a small 10ⁿ in the margin column beside each line holding such a number (as the
// Important levels show there), opening its notations. The pill itself shows only on hover.
registerMarginSource('numbers', (state) => {
  const out: MarginItem[] = [];
  for (const d of pillKey.getState(state)?.find() ?? []) {
    out.push({
      key: `number-${d.from}`,
      from: d.from,
      to: d.to,
      icon: () => { const s = document.createElement('span'); s.className = own.mark; s.textContent = '10ⁿ'; return s; },
      color: 'var(--color-muted)',
      title: `${state.doc.textBetween(d.from, d.to)} · ${LABELS.numberNotation.choose}`,
      open: (view, anchor) => openNumberMenuAt(view, d.from, d.to, anchor),
    });
  }
  return out;
});

// The notations of the number a pill shows, in a small menu under it; the one it's in now ticked.
export function openNumberMenu(view: EditorView, pill: HTMLElement): void {
  const from = view.posAtDOM(pill, 0);
  openNumberMenuAt(view, from, from + (pill.textContent ?? '').length, pill.getBoundingClientRect());
}

// The same menu for the number at from..to, under `anchor` (the pill's ▾, or its margin mark).
export function openNumberMenuAt(view: EditorView, from: number, to: number, anchor: DOMRect): void {
  if (!view.editable || to > view.state.doc.content.size) return;
  const text = view.state.doc.textBetween(from, to);
  if (!notationReady(text)) return;
  openBlockPopover(anchor, (close) => {
    const box = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = pop.heading;
    heading.textContent = LABELS.numberNotation.menu;
    box.append(heading);
    for (const f of numberForms(text)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = own.form;
      const now = f.text === text.trim();
      b.setAttribute('aria-pressed', String(now));
      b.innerHTML = '';
      const name = document.createElement('span');
      name.textContent = LABELS.numberNotation.names[f.notation];
      const value = document.createElement('strong');
      value.textContent = f.text;
      b.append(name, value);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { close(); if (!now) writeNumberAs(view, { from, to }, f.text, false); view.focus(); });
      box.append(b);
    }
    return box;
  });
}

// The ▾ shown at a hovered pill's right end: one button per editor, placed on the pill.
function pillButtonPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('numberPillButton'),
    view(view) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = own.more;
      btn.textContent = '▾';
      btn.title = LABELS.numberNotation.choose;
      btn.setAttribute('aria-label', LABELS.numberNotation.choose);
      btn.hidden = true;
      document.body.append(btn);
      let pill: HTMLElement | null = null;
      let hideTimer: ReturnType<typeof setTimeout> | null = null;
      const hide = () => { btn.hidden = true; pill = null; };
      const hideSoon = () => { if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(hide, 250); };
      const over = (e: MouseEvent) => {
        const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-number-ready]');
        if (!el || !view.editable) { if (pill) hideSoon(); return; }
        if (hideTimer) clearTimeout(hideTimer);
        pill = el;
        const r = el.getBoundingClientRect();
        btn.style.left = `${r.right - 2}px`;
        btn.style.top = `${r.top + r.height / 2}px`;
        btn.hidden = false;
      };
      btn.addEventListener('mouseenter', () => { if (hideTimer) clearTimeout(hideTimer); });
      btn.addEventListener('mouseleave', hideSoon);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => { const p = pill; hide(); if (p) openNumberMenu(view, p); });
      const onScroll = () => hide();
      view.dom.addEventListener('mouseover', over);
      view.dom.addEventListener('mouseleave', hideSoon);
      window.addEventListener('scroll', onScroll, true);
      return {
        update: () => { if (pill && !pill.isConnected) hide(); },
        destroy() {
          if (hideTimer) clearTimeout(hideTimer);
          view.dom.removeEventListener('mouseover', over);
          view.dom.removeEventListener('mouseleave', hideSoon);
          window.removeEventListener('scroll', onScroll, true);
          btn.remove();
        },
      };
    },
  });
}

// ── The offer ────────────────────────────────────────────────────────────────

export interface NumberOffer extends TypingOfferMatch { scientific: string }

// Typing a plain or grouped number of seven or more digits, then a space (or closing punctuation),
// offers its scientific form. Not inside code; once per number per note when passed over.
export function findNumberOffer(state: EditorState, typed: string, passedOver: ReadonlySet<string> = new Set()): NumberOffer | null {
  if (!/^[\s)\];:!?]$/.test(typed)) return null;
  const { selection } = state;
  if (!selection.empty) return null;
  const $c = selection.$from;
  if (!$c.parent.isTextblock || $c.parent.type.spec.code || $c.marks().some((m) => m.type.spec.code)) return null;
  const before = $c.parent.textBetween(0, $c.parentOffset - typed.length, undefined, '￼');
  const at = numberAt(before, before.length);
  if (!at || at.to !== before.length) return null;
  const text = before.slice(at.from, at.to);
  const notation = notationOf(text);
  const n = parseNumber(text);
  if (!n || (notation !== 'plain' && notation !== 'grouped') || !notationReady(text) || passedOver.has(text)) return null;
  const from = $c.start() + at.from;
  return { from, to: from + text.length, id: text, scientific: formatNumber(n, 'scientific') };
}

export const NumberNotation = Extension.create({
  name: 'numberNotation',
  priority: 110,   // ahead of DesignCycle, which takes the same keys when this lets them go

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => cycle(this.editor.view, 1),
      'Mod-[': () => cycle(this.editor.view, -1),
    };
  },

  addProseMirrorPlugins() {
    const ctx = () => objectTriggerStorage(this.editor).getContext();
    return [
      new Plugin<DecorationSet>({
        key: pillKey,
        state: {
          init: (_c, state) => decorate(state),
          apply: (tr, old, _o, state) => (tr.docChanged ? decorate(state) : old.map(tr.mapping, tr.doc)),
        },
        props: { decorations: (state) => pillKey.getState(state) },
      }),
      pillButtonPlugin(),
      typingOfferPlugin<NumberOffer>({
        name: 'numberOffer',
        find: (state, typed, _noteId, passedOver) => findNumberOffer(state, typed, passedOver),
        chip: (o) => ({ text: LABELS.numberNotation.offer, strong: o.scientific }),
        accept: (state, o) => state.tr.insertText(o.scientific, o.from, o.to),
      }, () => ctx()?.noteId ?? null),
    ];
  },
});

// Right-click on a number: its other forms, each shown as it would read.
registerContextMenuProvider({
  id: 'note-editor.number-notation',
  kind: 'note-editor',
  order: 6,
  when: (_ctx, scope) => !!numberRange((scope.data as NoteEditorMenuApi).editor.state),
  items: (_ctx, scope) => {
    const view = (scope.data as NoteEditorMenuApi).editor.view;
    const range = numberRange(view.state);
    if (!range) return [];
    const forms = numberForms(range.text).filter((f) => f.text !== range.text.trim());
    if (!forms.length) return [];
    return [{
      id: 'number-format', label: LABELS.numberNotation.menu, icon: '#',
      submenu: [forms.map((f) => ({
        id: f.notation, label: `${LABELS.numberNotation.names[f.notation]}: ${f.text}`,
        run: () => writeNumberAs(view, range, f.text, !view.state.selection.empty),
      }))],
    }];
  },
});
