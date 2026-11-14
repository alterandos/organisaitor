import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { longMark, type LongList } from '@/utils/longText';
import { escapeHtml } from '@/utils/richText';

// The DOM half of long text (utils/longText.ts): a field's edited HTML read back as lines, and the
// list keys, for every long field drawn outside the note editor (a Glossary card's long fields,
// an AI prompt's sections). One module, so the two can't drift (agreed with the user 2026-11-14).
// The keys follow a block's long parts (CLAUDE.md "A block's long parts hold lines and bullets"):
// Ctrl+. bullets, Ctrl+/ numbers (on and off), Tab / Shift+Tab indent and outdent an item, Enter in
// an item the next item and, on an empty one, back to a plain line (the browser's own list editing).

const INLINE_BREAKS = new Set(['DIV', 'P']);

// The lines of an edited field, each a line of the field's text (formatted HTML: `html`; else its
// plain text), a list item written with its mark.
export function domToLongLines(root: Node, opts: { html: boolean }): string[] {
  const lines: string[] = [];
  let cur: string | null = null;
  const text = (n: Node) => (opts.html ? escapeHtml(n.textContent ?? '') : n.textContent ?? '');
  const add = (s: string) => { cur = (cur ?? '') + s; };
  const flush = () => { if (cur !== null) { lines.push(cur); cur = null; } };
  const inline = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { add(text(n)); return; }
    if (!(n instanceof Element)) return;
    if (opts.html) add(n.outerHTML.replace(/<br\s*\/?>/gi, ''));
    else add(n.textContent ?? '');
  };
  const list = (el: Element, depth: number) => {
    flush();
    const kind = el.tagName.toLowerCase() as LongList;
    let n = 0;
    for (const child of Array.from(el.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) { list(child, depth + 1); continue; }
      if (!(child instanceof Element) || child.tagName !== 'LI') continue;
      n++;
      let line = '';
      const nested: Element[] = [];
      for (const part of Array.from(child.childNodes)) {
        if (part instanceof Element && (part.tagName === 'UL' || part.tagName === 'OL')) { nested.push(part); continue; }
        if (part instanceof Element && part.tagName === 'BR') continue;
        if (part.nodeType === Node.TEXT_NODE) line += text(part);
        else if (part instanceof Element) line += opts.html ? part.outerHTML : part.textContent ?? '';
      }
      lines.push(longMark(kind, depth, n) + line);
      for (const sub of nested) list(sub, depth + 1);
    }
  };
  const block = (el: Node) => {
    for (const n of Array.from(el.childNodes)) {
      if (n instanceof Element && n.tagName === 'BR') { lines.push(cur ?? ''); cur = null; continue; }
      if (n instanceof Element && (n.tagName === 'UL' || n.tagName === 'OL')) { list(n, 0); continue; }
      if (n instanceof Element && INLINE_BREAKS.has(n.tagName)) {
        flush();
        block(n);
        flush();
        continue;
      }
      inline(n);
    }
  };
  block(root);
  flush();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

// Edited HTML (a string, never put on a page) read back as lines: parsed off the page, so nothing in
// it loads or runs.
export function htmlToLongLines(html: string, opts: { html: boolean }): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return domToLongLines(doc.body, opts);
}

const inItem = (root: HTMLElement): boolean => {
  const sel = window.getSelection();
  const n = sel?.anchorNode ?? null;
  const el = n instanceof Element ? n : n?.parentElement ?? null;
  const li = el?.closest('li');
  return !!li && root.contains(li);
};

// The list keys of a long field. True when the key was one (the caller does nothing more with it).
// Enter in an item is left to the browser (the next item, or out of the list from an empty one)
// and kept from the field's own Enter (the next field).
export function longTextKeyDown(e: KeyboardEvent | ReactKeyboardEvent, root: HTMLElement): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey && !e.shiftKey && (e.key === '.' || e.key === '/')) {
    e.preventDefault();
    e.stopPropagation();
    document.execCommand?.(e.key === '.' ? 'insertUnorderedList' : 'insertOrderedList');
    root.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (e.key === 'Tab' && !mod && !e.altKey && inItem(root)) {
    e.preventDefault();
    e.stopPropagation();
    document.execCommand?.(e.shiftKey ? 'outdent' : 'indent');
    root.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey && inItem(root)) {
    e.stopPropagation();
    return true;
  }
  return false;
}

// A field that starts as a list (a card's Key points): its first line made a bullet when it's
// empty and gets the cursor.
export function startAsList(root: HTMLElement): void {
  if ((root.textContent ?? '').trim() || root.querySelector('li')) return;
  document.execCommand?.('insertUnorderedList');
}

// Where the cursor is in the field's text as lines (joined by "\n", marks included): for a paste
// that fills a prompt in at the cursor, and for ↑ ↓ at the first and last line.
export function caretInLines(root: HTMLElement): { from: number; to: number; total: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const upTo = (node: Node, offset: number) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    const box = document.createElement('div');
    box.append(range.cloneContents());
    return domToLongLines(box, { html: false }).join('\n').length;
  };
  return { from: upTo(r.startContainer, r.startOffset), to: upTo(r.endContainer, r.endOffset), total: domToLongLines(root, { html: false }).join('\n').length };
}

// The cursor into a field (an input, a textarea or a long field), at its start or end.
export function focusEdge(el: HTMLElement, at: 'start' | 'end'): void {
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const n = at === 'start' ? 0 : el.value.length;
    el.setSelectionRange(n, n);
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(at === 'start');
  sel.removeAllRanges();
  sel.addRange(range);
}

// Whether the cursor is on a long field's (or a textarea's) first or last line, for ↑ ↓.
export function onEdgeLine(el: HTMLElement, up: boolean): boolean {
  if (el instanceof HTMLTextAreaElement) {
    if (el.selectionStart !== el.selectionEnd) return false;
    const at = el.selectionStart;
    return up ? el.value.lastIndexOf('\n', at - 1) < 0 : el.value.indexOf('\n', at) < 0;
  }
  if (!el.hasAttribute('data-long-text')) return true;
  const c = caretInLines(el);
  if (!c || c.from !== c.to) return false;
  const text = domToLongLines(el, { html: false }).join('\n');
  return up ? text.lastIndexOf('\n', c.from - 1) < 0 : text.indexOf('\n', c.from) < 0;
}
