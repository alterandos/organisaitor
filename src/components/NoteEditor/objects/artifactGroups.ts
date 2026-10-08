import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { openArtifactTarget } from '@/services/openCrossAppTarget';
import { LABELS } from '@/config/labels';
import { ITEM_FLAG_ICON } from '@/config/itemIcons';
import { ARTIFACT_TYPES, FALLBACK_ARTIFACT_ICON, type ArtifactSummary } from './artifactTypes';
import { ArtifactBody } from './ArtifactBody';
import { requestOccurrenceList } from './occurrenceRequests';
import { clearPaneState } from './paneState';
import styles from './ArtifactLinks.module.css';
import { createDisclosureIcon } from '@/components/Icons';

// How linked text (an `artifactLink` mark, made by `\` or Ctrl+Q) is drawn. ProseMirror splits a
// mark into one element per paragraph and wherever another mark starts or stops inside it, so
// anything drawn per element repeated. Here the pieces are grouped back into one link first, then
// drawn once, as an object:
//   basic    — an inline pane around the text: [icon KIND] text [date time · flags · ☐ ↗ ▾],
//              sized to its contents, styled by the item's live state (done, overdue, archived,
//              deleted). The text is the note's own (click to edit it); the date and time are
//              click-to-edit; ☐ marks done; ↗ opens; any other click on it expands/collapses.
//   expanded — the SAME pane grown into a box: the paragraph holding the link becomes the pane,
//              that line its heading, and the body (the type's Body: notes, links, Endeavour —
//              nothing the heading shows) sits inside it underneath, in its own React root.
// Which one is stored on the mark (`display`), so it's saved with the note. Live state is re-read
// from the stores whenever they change (and every minute, for "overdue"). The note text is the
// item's title (a `\` object replaces what was typed with it).

export type ArtifactDisplay = 'basic' | 'expanded';

export interface ArtifactGroup {
  key:        string;   // "<targetType>:<targetId>"
  targetType: string;
  targetId:   string;
  display:    ArtifactDisplay;
  from:       number;
  to:         number;
  fragments:  { from: number; to: number }[];
}

// The links in a document, each one run of text linking to one item. Pieces of the same link
// separated only by whitespace or paragraph breaks are one link; any other text in between makes
// two (the same item linked from two places shows twice).
export function collectArtifactGroups(doc: PMNode): ArtifactGroup[] {
  const groups: ArtifactGroup[] = [];
  let current: ArtifactGroup | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === 'artifactLink' && m.attrs.targetId);
    if (!mark) return;
    const key = `${mark.attrs.targetType}:${mark.attrs.targetId}`;
    const end = pos + node.nodeSize;
    if (current && current.key === key && !doc.textBetween(current.to, pos, '', '￼').trim()) {
      current.to = end;
      current.fragments.push({ from: pos, to: end });
      return;
    }
    current = {
      key,
      targetType: mark.attrs.targetType,
      targetId:   mark.attrs.targetId,
      display:    mark.attrs.display === 'expanded' ? 'expanded' : 'basic',
      from:       pos,
      to:         end,
      fragments:  [{ from: pos, to: end }],
    };
    groups.push(current);
  });
  return groups;
}

// The link to `key` nearest `pos` (an item can be linked from more than one place in a note).
export function findArtifactGroup(doc: PMNode, key: string, pos: number): ArtifactGroup | null {
  return collectArtifactGroups(doc)
    .filter((g) => g.key === key)
    .sort((a, b) => Math.abs(a.from - pos) - Math.abs(b.from - pos))[0] ?? null;
}

// Shows a link inline or as a card: rewrites `display` on every piece of the link.
export function setArtifactDisplay(view: EditorView, key: string, pos: number, display: ArtifactDisplay): void {
  if (display === 'basic') clearPaneState(key);
  const { state } = view;
  const markType = state.schema.marks.artifactLink;
  const group = findArtifactGroup(state.doc, key, pos);
  if (!group || !markType) return;
  const tr = state.tr;
  for (const f of group.fragments) {
    tr.addMark(f.from, f.to, markType.create({ targetType: group.targetType, targetId: group.targetId, display }));
  }
  view.dispatch(tr);
}

// Removes this one link (every piece of it), leaving the text.
export function unlinkArtifactGroup(view: EditorView, key: string, pos: number): void {
  const group = findArtifactGroup(view.state.doc, key, pos);
  const markType = view.state.schema.marks.artifactLink;
  if (!group || !markType) return;
  const tr = view.state.tr;
  for (const f of group.fragments) tr.removeMark(f.from, f.to, markType);
  view.dispatch(tr);
}

type LinkState = ArtifactSummary['state'] | 'missing';

const STATE_LABEL: Partial<Record<LinkState, string>> = {
  overdue:  LABELS.noteObjects.link.overdue,
  archived: LABELS.noteObjects.link.archived,
  missing:  LABELS.noteObjects.link.deleted,
};

const defOf = (group: ArtifactGroup) => ARTIFACT_TYPES[group.targetType as keyof typeof ARTIFACT_TYPES];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A control inside a widget: keeps the editor's focus and selection, runs on click, and doesn't
// let the click reach the heading behind it (which would expand/collapse the pane).
function control<K extends keyof HTMLElementTagNameMap>(node: HTMLElementTagNameMap[K], title: string, run: () => void): HTMLElementTagNameMap[K] {
  node.title = title;
  node.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(); });
  return node;
}

// The heading's own background: a click anywhere on it that isn't a control expands or collapses.
function toggles(node: HTMLElement, view: EditorView, group: ArtifactGroup, getPos: () => number | undefined) {
  node.addEventListener('mousedown', (e) => e.preventDefault());
  node.addEventListener('click', (e) => {
    e.preventDefault();
    setArtifactDisplay(view, group.key, getPos() ?? group.from, group.display === 'expanded' ? 'basic' : 'expanded');
  });
}

function widgetRoot(className: string, group: ArtifactGroup, part: string, state: LinkState): HTMLSpanElement {
  const span = el('span', className);
  span.contentEditable = 'false';
  span.dataset.artifactTarget = group.key;
  span.dataset.artifactPart = part;
  span.dataset.artifactState = state;
  return span;
}

// [icon KIND] — part of the heading: a click expands or collapses.
// The kind's icon is also where an item with a done state is ticked: while the pane is hovered
// (or once it's done) the icon shows as a checkbox in the same slot — nothing moves, nothing is
// covered (the row options pattern: an icon that becomes its control on hover).
function paneHead(group: ArtifactGroup, icon: string, kindLabel: string, title: string, state: LinkState, summary: ArtifactSummary | null) {
  return (view: EditorView, getPos: () => number | undefined) => {
    const L = LABELS.noteObjects.link;
    const head = widgetRoot(styles.paneHead, group, 'head', state);
    head.title = title;
    if (hoveredKey.get(view) === group.key) head.dataset.hover = '1';
    head.append(el('span', styles.paneIcon, icon));
    const def = defOf(group);
    if (summary && summary.done !== null && def?.toggleDone) {
      head.dataset.canDone = '1';
      if (summary.done) head.dataset.done = '1';
      head.append(control(el('span', styles.paneDone, summary.done ? '☑' : '☐'), summary.done ? L.markNotDone : L.markDone, () => def.toggleDone!(group.targetId)));
    }
    head.append(el('span', styles.paneKind, kindLabel));
    // Important sits before the title, in both views: it's the one option that changes how much
    // attention the item needs. Expanded, a click turns it off (it comes back greyed at the bottom).
    if (summary?.important) {
      const important = def?.flags?.(group.targetId).find((f) => f.id === 'important');
      head.append(group.display === 'expanded' && important
        ? control(el('span', `${styles.paneFlag} ${styles.paneFlagOn} ${styles.paneImportant}`, ITEM_FLAG_ICON.important), L.removeOption(important.label), important.toggle)
        : el('span', `${styles.paneFlag} ${styles.paneImportant}`, ITEM_FLAG_ICON.important));
    }
    toggles(head, view, group, getPos);
    return head;
  };
}

// Which link the mouse is over, per editor, so its head can show the checkbox (the head, the
// text and the tail are separate elements, so CSS :hover on one can't reach the others).
const hoveredKey = new WeakMap<EditorView, string | null>();

function setHovered(view: EditorView, key: string | null) {
  if (hoveredKey.get(view) === key) return;
  hoveredKey.set(view, key);
  view.dom.querySelectorAll<HTMLElement>('[data-artifact-target]').forEach((piece) => {
    if (piece.dataset.artifactTarget === key) piece.dataset.hover = '1';
    else delete piece.dataset.hover;
  });
}

// The date or time in the heading becomes a small input when clicked; Enter (or leaving it) saves
// what it understood, Esc puts it back. A value it can't read is outlined and kept for fixing.
function editablePart(group: ArtifactGroup, part: 'date' | 'time', text: string, ghost: boolean) {
  const def = defOf(group)!;
  const L = LABELS.noteObjects.link;
  const span = el('span', `${styles.paneEditable} ${ghost ? styles.paneGhost : ''}`, text);
  return control(span, part === 'date' ? L.editDate : L.editTime, () => {
    const input = el('input', styles.paneInput);
    input.value = ghost ? '' : text;
    input.placeholder = part === 'date' ? L.datePlaceholder : L.timePlaceholder;
    input.size = Math.max(8, input.value.length + 2);
    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      const changed = input.value.trim() !== (ghost ? '' : text);
      if (save && changed && !def.editWhen!(group.targetId, part, input.value)) {
        input.classList.add(styles.paneInputInvalid);
        return;
      }
      finished = true;
      // Saved: the store change redraws the heading anyway. Not saved: put the text back.
      if (!(save && changed)) input.replaceWith(span);
    };
    for (const type of ['mousedown', 'click'] as const) input.addEventListener(type, (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => {
      finish(true);
      if (!finished) { finished = true; input.replaceWith(span); }
    });
    span.replaceWith(input);
    input.focus();
    input.select();
  });
}

// [date time · ❗ ✏️ 🔁 · state · ☐ ↗ ▾] — the date and time edit, ☐ marks done, ↗ opens,
// anything else expands or collapses.
function paneTail(group: ArtifactGroup, summary: ArtifactSummary | null, state: LinkState) {
  return (view: EditorView, getPos: () => number | undefined) => {
    const L = LABELS.noteObjects.link;
    const tail = widgetRoot(styles.paneTail, group, 'tail', state);
    const def = defOf(group);
    if (!summary) {
      const gone = el('span', styles.paneState, L.deleted);
      gone.title = L.missing;
      tail.append(gone);
      tail.append(control(el('button', styles.paneBtn, '✕'), L.unlink, () => unlinkArtifactGroup(view, group.key, getPos() ?? group.to)));
      return tail;
    }
    const expanded = group.display === 'expanded';
    if (!expanded) {
      // Expanded, the date, time and options move to the pane's second heading line (WhenLine).
      if (summary.dateLabel) {
        const when = el('span', styles.paneWhen);
        if (summary.repeats && def?.occurrences) {
          when.append(control(el('span', `${styles.paneEditable} ${styles.paneSeries}`, `${summary.dateLabel} ▾`), L.seeDates, () => {
            requestOccurrenceList(group.key);
            setArtifactDisplay(view, group.key, getPos() ?? group.to, 'expanded');
          }));
          if (summary.timeLabel && def.editWhen) when.append(editablePart(group, 'time', summary.timeLabel, false));
        } else if (def?.editWhen) {
          when.append(editablePart(group, 'date', summary.dateLabel, false));
          if (summary.timeLabel) when.append(editablePart(group, 'time', summary.timeLabel, false));
        } else {
          when.textContent = summary.when ?? '';
        }
        tail.append(when);
      }
      const flags: [boolean, string, string][] = [
        [summary.tentative, ITEM_FLAG_ICON.tentative, LABELS.noteObjects.card.tentative],
        [summary.repeats, ITEM_FLAG_ICON.repeats, L.repeats],
      ];
      for (const [on, icon, label] of flags) {
        if (!on) continue;
        const flag = el('span', styles.paneFlag, icon);
        flag.title = label;
        tail.append(flag);
      }
      if (state !== 'open' && STATE_LABEL[state]) tail.append(el('span', styles.paneState, STATE_LABEL[state]));
    }
    // ↗ and the chevron, together: at the pane's right edge when it's expanded.
    const actions = el('span', styles.paneActions);
    actions.append(control(el('button', styles.paneBtn, '↗'), L.open, () => { openArtifactTarget(group.targetType, group.targetId, summary.repeats ? summary.occurrence ?? undefined : undefined); }));
    const chevron = el('span', styles.paneChevron);
    chevron.append(createDisclosureIcon(expanded));
    chevron.title = expanded ? L.hideDetails : L.showDetails;
    actions.append(chevron);
    tail.append(actions);
    toggles(tail, view, group, getPos);
    return tail;
  };
}

// The bodies' React roots, by host element, so a removed body's root can be unmounted.
const bodyRoots = new WeakMap<Element, Root>();

// slot: "<link key>|<nth>" — which pane this body is, for its UI state (paneState.ts), which
// outlives the widget if ProseMirror builds the body again.
function bodyWidget(group: ArtifactGroup, slot: string) {
  return (view: EditorView, getPos: () => number | undefined) => {
    const host = el('div', styles.paneBody);
    host.contentEditable = 'false';
    host.dataset.artifactTarget = group.key;
    host.dataset.artifactPart = 'body';
    const root = createRoot(host);
    bodyRoots.set(host, root);
    root.render(createElement(ArtifactBody, {
      targetType: group.targetType,
      targetId:   group.targetId,
      stateKey:   slot,
      onToggle:   () => setArtifactDisplay(view, group.key, getPos() ?? group.to, 'basic'),
    }));
    return host;
  };
}

// Unmounting while React may be mid-render (an edit inside that root caused the redraw) isn't
// allowed synchronously, so it waits a tick.
function destroyBody(node: Node) {
  const root = bodyRoots.get(node as Element);
  if (root) setTimeout(() => root.unmount(), 0);
}

export function buildArtifactDecorations(doc: PMNode, now: Date = new Date()): { set: DecorationSet; count: number } {
  const groups = collectArtifactGroups(doc);
  const decos: Decoration[] = [];
  const seen = new Map<string, number>();
  const paned = new Set<number>();
  for (const group of groups) {
    const def = defOf(group);
    const summary = def ? def.summarize(group.targetId, now) : null;
    const state: LinkState = summary ? summary.state : 'missing';
    const icon = def?.icon ?? FALLBACK_ARTIFACT_ICON;
    const kindLabel = def?.label ?? '';
    const what = summary ? [summary.title, summary.when].filter(Boolean).join(' · ') : LABELS.noteObjects.link.missing;
    const nth = (seen.get(group.key) ?? 0) + 1;
    seen.set(group.key, nth);

    decos.push(Decoration.widget(group.from, paneHead(group, icon, kindLabel, LABELS.noteObjects.link.iconTitle(kindLabel, what), state, summary), {
      side: 1, marks: [], key: `pane-head|${group.key}|${state}|${icon}|${kindLabel}|${what}|${group.display}|${summary?.done}|${summary?.important}`,
      stopEvent: () => true, ignoreSelection: true,
    }));
    for (const f of group.fragments) {
      decos.push(Decoration.inline(f.from, f.to, { class: styles.paneText, 'data-artifact-state': state, 'data-artifact-target': group.key }));
    }
    // side 1: the cursor at the end of the text sits before the date and buttons, so typing there
    // extends the title (the mark is inclusive), as it looks like it should.
    decos.push(Decoration.widget(group.to, paneTail(group, summary, state), {
      side: 1, marks: [], key: `pane-tail|${group.key}|${state}|${group.display}|${JSON.stringify(summary)}`,
      stopEvent: () => true, ignoreSelection: true,
    }));

    // Expanded: the paragraph(s) holding the link become the pane — the line above is its heading —
    // and the body goes inside the last of them, so heading and body are one box.
    if (group.display !== 'expanded' || !summary) continue;
    const blocks: { pos: number; end: number; contentEnd: number }[] = [];
    doc.nodesBetween(group.from, group.to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!paned.has(pos)) blocks.push({ pos, end: pos + node.nodeSize, contentEnd: pos + node.nodeSize - 1 });
      return false;
    });
    if (blocks.length === 0) continue;
    blocks.forEach((b, i) => {
      paned.add(b.pos);
      const role = blocks.length === 1 ? styles.paneBlockOnly : i === 0 ? styles.paneBlockFirst : i === blocks.length - 1 ? styles.paneBlockLast : styles.paneBlockMiddle;
      decos.push(Decoration.node(b.pos, b.end, {
        class: `${styles.paneBlock} ${role}`, 'data-artifact-pane': 'expanded', 'data-artifact-key': group.key, 'data-artifact-state': state,
      }));
    });
    decos.push(Decoration.widget(blocks[blocks.length - 1].contentEnd, bodyWidget(group, `${group.key}|${nth}`), {
      side: 1, key: `body|${group.key}|${nth}`,
      stopEvent: () => true, ignoreSelection: true, destroy: destroyBody,
    }));
  }
  return { set: DecorationSet.create(doc, decos), count: groups.length };
}

// Home / End on a line that is an expanded pane's heading: the body box inside the paragraph
// confuses the browser's own line ends (End went to the start of the next paragraph), so these
// move to the start / end of the heading's text themselves. Shift extends the selection.
function paneLineKeys(view: EditorView, event: KeyboardEvent): boolean {
  if ((event.key !== 'Home' && event.key !== 'End') || event.ctrlKey || event.metaKey || event.altKey) return false;
  const { state } = view;
  const { $head, anchor } = state.selection;
  const parent = $head.parent;
  if (!parent.isTextblock) return false;
  let expanded = false;
  parent.descendants((node) => {
    if (node.marks.some((m) => m.type.name === 'artifactLink' && m.attrs.display === 'expanded')) expanded = true;
  });
  if (!expanded) return false;
  const target = event.key === 'Home' ? $head.start() : $head.end();
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, event.shiftKey ? anchor : target, target)).scrollIntoView());
  event.preventDefault();
  return true;
}

interface GroupsState { set: DecorationSet; count: number }

const artifactGroupsKey = new PluginKey<GroupsState>('artifactLinkGroups');
const REFRESH = 'refresh';

export const ArtifactLinkGroups = Extension.create({
  name: 'artifactLinkGroups',

  addProseMirrorPlugins() {
    return [
      new Plugin<GroupsState>({
        key: artifactGroupsKey,
        state: {
          init: (_config, state: EditorState) => buildArtifactDecorations(state.doc),
          apply: (tr, prev) => (tr.docChanged || tr.getMeta(artifactGroupsKey) === REFRESH ? buildArtifactDecorations(tr.doc) : prev),
        },
        props: {
          decorations: (state) => artifactGroupsKey.getState(state)?.set ?? null,
          handleKeyDown: (view, event) => paneLineKeys(view, event),
          handleDOMEvents: {
            mouseover: (view, event) => {
              const over = (event.target as Element | null)?.closest?.('[data-artifact-target]');
              setHovered(view, over?.getAttribute('data-artifact-target') ?? null);
              return false;
            },
            mouseleave: (view) => { setHovered(view, null); return false; },
            mousedown: (_view, event) => {
              if ((event.target as HTMLElement).dataset?.artifactPane) event.preventDefault();
              return false;
            },
            click: (view, event) => {
              const box = event.target as HTMLElement;
              const key = box.dataset?.artifactPane ? box.dataset.artifactKey : undefined;
              if (!key) return false;
              let pos = 0;
              try { pos = view.posAtDOM(box, 0); } catch { /* the box is still the link's */ }
              setArtifactDisplay(view, key, pos, 'basic');
              event.preventDefault();
              return true;
            },
          },
        },
        // The link mark is inclusive (typing at the end of a title extends it), but it must never
        // be carried onto a line that doesn't hold it — Enter at the end of a title would otherwise
        // turn the next line into more of the same link.
        appendTransaction: (_trs, _old, state) => {
          const markType = state.schema.marks.artifactLink;
          const stored = state.storedMarks;
          const carried = stored?.find((m) => m.type === markType);
          if (!carried || !state.selection.empty) return null;
          let here = false;
          state.selection.$head.parent.descendants((node) => { if (carried.isInSet(node.marks)) here = true; });
          return here ? null : state.tr.setStoredMarks(stored!.filter((m) => m !== carried));
        },
        // Linked items change elsewhere (completed in Tasks, moved in Calendar, deleted): redraw.
        // Coalesced into one redraw per tick, and only while the note has links.
        view(editorView) {
          let scheduled = false;
          const refresh = () => {
            if (scheduled || !artifactGroupsKey.getState(editorView.state)?.count) return;
            scheduled = true;
            queueMicrotask(() => {
              scheduled = false;
              if (editorView.isDestroyed) return;
              editorView.dispatch(editorView.state.tr.setMeta(artifactGroupsKey, REFRESH).setMeta('addToHistory', false));
            });
          };
          const unsubscribe = Object.values(ARTIFACT_TYPES).map((def) => def!.subscribe(refresh));
          const timer = setInterval(refresh, 60_000);
          return {
            destroy() {
              unsubscribe.forEach((u) => u());
              clearInterval(timer);
            },
          };
        },
      }),
    ];
  },
});
