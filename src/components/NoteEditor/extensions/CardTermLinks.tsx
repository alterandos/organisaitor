import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { glossaryEntry } from '@/services/glossary';
import { definitionPassage, openNotePassage } from '@/services/notePassage';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import type { AnchorBox } from '@/utils/floatingPlacement';
import { termsEndingAt, type Term } from './GlossaryAutolink';
import { OfferChip, TermCard } from './CardTermLinkParts';

// Links to Glossary terms inside a Glossary card's fields (asked for by the user 2026-10-22: a
// Concept that mentions an acronym defined elsewhere should link it, with its card on hover). A
// card's fields aren't note text (they're small editors of their own, GlossaryCardBody's
// RichField), so the note editor's typing offer can't run there; this is the same offer for them:
// typing a term (as a whole word) shows a chip, Enter or Tab links it, Esc or typing on leaves it,
// following the "Offer links to Glossary terms" setting (never / once per card / every time). A
// link is stored in the field as `<a data-term="entryId">` (utils/richText.ts). Hovering one shows
// the term's card; Ctrl+click goes to where it's defined.

const WORD = /[\p{L}\p{N}]/u;
// Offers passed over, per card, this session ("once": not again for that term on that card).
const passed = new Map<string, Set<string>>();
const passedFor = (selfId: string) => { if (!passed.has(selfId)) passed.set(selfId, new Set()); return passed.get(selfId)!; };

export interface Offer { term: Term; length: number; anchor: AnchorBox }

// The text of `field` before the caret, and whether the caret is inside a term link already.
function caretContext(field: HTMLElement): { before: string; after: string; inLink: boolean } | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !field.contains(sel.anchorNode)) return null;
  const range = document.createRange();
  range.setStart(field, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  const rest = document.createRange();
  rest.setStart(sel.anchorNode, sel.anchorOffset);
  rest.setEnd(field, field.childNodes.length);
  const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement;
  return { before: range.toString(), after: rest.toString(), inLink: !!node?.closest('a[data-term]') };
}

// A range over the `length` characters just before the caret, across text nodes.
function rangeBeforeCaret(field: HTMLElement, length: number): Range | null {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  let node = sel.anchorNode as Node;
  let offset = sel.anchorOffset;
  if (!(node instanceof Text)) {
    // The caret between elements: the end of the text node just before it.
    const prev = texts.filter((t) => t.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING || node.contains(t)).pop();
    if (!prev) return null;
    node = prev;
    offset = prev.length;
  }
  const end = { node, offset };
  let i = texts.indexOf(node as Text);
  let left = length;
  while (i >= 0 && left > offset) { left -= offset; i -= 1; if (i < 0) return null; node = texts[i]; offset = texts[i].length; }
  const range = document.createRange();
  range.setStart(node, offset - left);
  range.setEnd(end.node, end.offset);
  return range;
}

export function useCardTermLinks(selfId: string | undefined): {
  onInput: (field: HTMLElement) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, field: HTMLElement) => boolean;
  onMouseOver: (e: MouseEvent<HTMLElement>) => void;
  onMouseOut: (e: MouseEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  overlay: ReactNode;
} {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [hover, setHover] = useState<{ entryId: string; anchor: AnchorBox } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEscapeClose(() => setHover(null), !!hover);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onInput = (field: HTMLElement) => {
    if (!selfId) return;
    const mode = useSettingsStore.getState().linkSuggestions;
    const ctx = mode === 'never' ? null : caretContext(field);
    if (!ctx || ctx.inLink || (ctx.after && WORD.test(ctx.after[0]))) { setOffer(null); return; }
    const already = (id: string) => !!field.querySelector(`a[data-term="${id}"]`);
    const found = termsEndingAt(ctx.before.slice(-80)).find(({ term }) => term.entryId !== selfId
      && (mode === 'always' || (!passedFor(selfId).has(term.entryId) && !already(term.entryId))));
    if (!found) { setOffer(null); return; }
    const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    const box = r && r.height ? r : field.getBoundingClientRect();
    setOffer({ ...found, anchor: { left: box.right, top: box.top, right: box.right, bottom: box.bottom } });
  };

  const accept = (field: HTMLElement, o: Offer) => {
    const range = rangeBeforeCaret(field, o.length);
    if (!range) return;
    const a = document.createElement('a');
    a.setAttribute('data-term', o.term.entryId);
    a.appendChild(range.extractContents());
    range.insertNode(a);
    // The caret after the link, so what's typed next isn't part of it.
    const after = document.createRange();
    after.setStartAfter(a);
    after.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(after);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    setOffer(null);
  };

  // True when the key was the offer's (the field's own keys then don't run).
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, field: HTMLElement): boolean => {
    if (!offer) return false;
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      accept(field, offer);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (selfId) passedFor(selfId).add(offer.term.entryId);
      setOffer(null);
      return true;
    }
    if (e.key.length === 1 || e.key === 'Backspace') {
      if (selfId && e.key.length === 1 && !WORD.test(e.key)) passedFor(selfId).add(offer.term.entryId);
      setOffer(null);
    }
    return false;
  };

  const linkOf = (e: MouseEvent<HTMLElement>) => (e.target as Element).closest?.('a[data-term]') as HTMLElement | null;
  const onMouseOver = (e: MouseEvent<HTMLElement>) => {
    const link = linkOf(e);
    if (!link) return;
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    const r = link.getBoundingClientRect();
    setHover({ entryId: link.getAttribute('data-term')!, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  };
  const onMouseOut = (e: MouseEvent<HTMLElement>) => {
    if (!linkOf(e)) return;
    hideTimer.current = setTimeout(() => setHover(null), 250);
  };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const link = linkOf(e);
    if (!link || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const entry = glossaryEntry(link.getAttribute('data-term')!);
    if (entry) openNotePassage(entry.noteId, definitionPassage(entry.id));
  };

  const overlay = (
    <>
      {offer && <OfferChip offer={offer} />}
      {hover && (
        <TermCard entryId={hover.entryId} anchor={hover.anchor}
          onEnter={() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }}
          onLeave={() => setHover(null)} />
      )}
    </>
  );
  return { onInput, onKeyDown, onMouseOver, onMouseOut, onClick, overlay };
}
