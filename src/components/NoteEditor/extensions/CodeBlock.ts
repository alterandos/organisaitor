import { mergeAttributes, type Editor } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { LABELS } from '@/config/labels';
import { log, errorMessage } from '@/utils/log';
import { applyFrameAttrs, blockFrameAttributes, blockPill, designButtons, frameButtons, pillButton, selectButton, type BlockDesign, replaceTypedWithBlock } from './blockDesigns';

// A code block (`\code`, or ``` as in Markdown): the editor's codeBlock node, kept under its name
// so older notes open unchanged, made a note block — a language (picked, or detected), colouring
// by language (lowlight, loaded the first time a note shows code), Copy, three designs, frames
// and selection. Tab indents inside it; three Enters, or ↓ at the end, leave it.

export const CODE_VARIANTS = ['plain', 'numbered', 'terminal'] as const;
export type CodeVariant = typeof CODE_VARIANTS[number];

export const CODE_DESIGNS: BlockDesign<CodeVariant>[] = [
  { id: 'plain',    label: LABELS.noteBlocks.code.designs.plain,    icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5 3.8 8 5 9.5M11 6.5 12.2 8 11 9.5"/></svg>' },
  { id: 'numbered', label: LABELS.noteBlocks.code.designs.numbered, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5.5 3v10M7.5 6h4.5M7.5 8.5h3M7.5 11h4"/></svg>' },
  { id: 'terminal', label: LABELS.noteBlocks.code.designs.terminal, icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 5.5h12M4.5 8l1.6 1.4-1.6 1.4M7.8 11h3"/></svg>' },
];

// The languages offered (lowlight's common set, which is what's loaded). `null` = detect it.
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: 'bash', label: 'Bash' }, { id: 'c', label: 'C' }, { id: 'cpp', label: 'C++' }, { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' }, { id: 'diff', label: 'Diff' }, { id: 'go', label: 'Go' }, { id: 'graphql', label: 'GraphQL' },
  { id: 'xml', label: 'HTML / XML' }, { id: 'ini', label: 'INI / TOML' }, { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' }, { id: 'json', label: 'JSON' }, { id: 'kotlin', label: 'Kotlin' },
  { id: 'less', label: 'Less' }, { id: 'lua', label: 'Lua' }, { id: 'makefile', label: 'Makefile' },
  { id: 'markdown', label: 'Markdown' }, { id: 'objectivec', label: 'Objective-C' }, { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' }, { id: 'python', label: 'Python' }, { id: 'r', label: 'R' }, { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' }, { id: 'scss', label: 'SCSS' }, { id: 'shell', label: 'Shell session' }, { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' }, { id: 'typescript', label: 'TypeScript' }, { id: 'vbnet', label: 'VB.NET' },
  { id: 'wasm', label: 'WebAssembly' }, { id: 'yaml', label: 'YAML' },
];

export const PLAIN_TEXT = 'plaintext';

export const languageLabel = (id: string | null): string =>
  id === PLAIN_TEXT ? LABELS.noteBlocks.code.plainText : CODE_LANGUAGES.find((l) => l.id === id)?.label ?? id ?? LABELS.noteBlocks.code.auto;

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  (values as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

// ── Colouring ────────────────────────────────────────────────────────────────
// lowlight (highlight.js grammars) turns the text into class-named spans, drawn here as inline
// decorations. Its own chunk, loaded the first time a note has a code block; until then the code
// shows uncoloured. Results are kept per node (nodes never change), so typing in one block
// re-colours only that block.

interface HastText { type: 'text'; value: string }
interface HastElement { type: 'element'; properties?: { className?: string[] }; children: HastNode[] }
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };
interface HastRoot { children: HastNode[]; data?: { language?: string } }
interface Lowlight {
  highlight: (language: string, value: string) => HastRoot;
  highlightAuto: (value: string) => HastRoot;
  registered: (language: string) => boolean;
}

let lowlight: Lowlight | null = null;
let loading: Promise<void> | null = null;

export function loadHighlighter(): Promise<void> {
  loading ??= import('lowlight').then(({ createLowlight, common }) => { lowlight = createLowlight(common) as unknown as Lowlight; });
  return loading;
}

// Detection reads at most this much: highlightAuto tries every grammar.
const AUTO_LIMIT = 4000;

interface Coloured { spans: { from: number; to: number; cls: string }[]; detected: string | null }
const colouredCache = new WeakMap<PMNode, Coloured>();

export function colourCode(node: PMNode): Coloured {
  const cached = colouredCache.get(node);
  if (cached) return cached;
  const result: Coloured = { spans: [], detected: null };
  const text = node.textContent;
  const lang = node.attrs.language as string | null;
  if (lowlight && text && lang !== PLAIN_TEXT) {
    let tree: HastRoot | null = null;
    if (lang && lowlight.registered(lang)) tree = lowlight.highlight(lang, text);
    else if (!lang) { tree = lowlight.highlightAuto(text.slice(0, AUTO_LIMIT)); result.detected = tree.data?.language ?? null; }
    if (tree) {
      let at = 0;
      const walk = (nodes: HastNode[], cls: string[]) => {
        for (const n of nodes) {
          if (n.type === 'text') {
            const len = (n as HastText).value.length;
            if (cls.length) result.spans.push({ from: at, to: at + len, cls: cls.join(' ') });
            at += len;
          } else if ('children' in n && n.children) {
            walk(n.children, [...cls, ...((n as HastElement).properties?.className ?? [])]);
          }
        }
      };
      walk(tree.children, []);
    }
  }
  if (lowlight) colouredCache.set(node, result);
  return result;
}

const highlightKey = new PluginKey<DecorationSet>('codeHighlight');

function colourDoc(doc: PMNode): DecorationSet {
  if (!lowlight) return DecorationSet.empty;
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    for (const s of colourCode(node).spans) decos.push(Decoration.inline(pos + 1 + s.from, pos + 1 + s.to, { class: s.cls }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

const hasCode = (doc: PMNode) => { let found = false; doc.descendants((n) => { if (n.type.name === 'codeBlock') found = true; return !found; }); return found; };

const codeHighlightPlugin = () => new Plugin<DecorationSet>({
  key: highlightKey,
  state: {
    init: (_c, state) => colourDoc(state.doc),
    apply: (tr, old) => (tr.docChanged || tr.getMeta(highlightKey) ? colourDoc(tr.doc) : old),
  },
  props: { decorations: (state) => highlightKey.getState(state) },
  view: (view) => {
    const ensure = (v: EditorView) => {
      if (lowlight || !hasCode(v.state.doc)) return;
      loadHighlighter()
        .then(() => { if (!v.isDestroyed) v.dispatch(v.state.tr.setMeta(highlightKey, true).setMeta('addToHistory', false)); })
        .catch((e) => log.warn('codeBlock', 'could not load the code highlighter', errorMessage(e)));
    };
    ensure(view);
    return { update: ensure };
  },
});

// ── The node ─────────────────────────────────────────────────────────────────

export const NoteCodeBlock = CodeBlock.extend({
  addOptions() {
    return { ...this.parent!(), enableTabIndentation: true, tabSize: 2 };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      ...blockFrameAttributes(),
      variant: {
        default: 'plain',
        parseHTML: (el: HTMLElement) => oneOf(CODE_VARIANTS, el.getAttribute('data-variant'), 'plain'),
        renderHTML: (a: Record<string, unknown>) => ({ 'data-variant': a.variant }),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const lang = node.attrs.language as string | null;
    return ['pre', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'code-block', 'data-note-block': '' }),
      ['code', { class: lang ? `${this.options.languageClassPrefix}${lang}` : null }, 0]];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new CodeView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), codeHighlightPlugin()];
  },
});

// `\code`: replaces from..to (what was typed and the space before it) with an empty code block, the
// cursor in it. An empty line becomes the block; otherwise it goes after the line.
export function insertCode(state: EditorState, from: number, to: number): Transaction | null {
  const type = state.schema.nodes.codeBlock;
  if (!type) return null;
  const node = type.create();
  const made = replaceTypedWithBlock(state, from, to, node);
  if (!made) return null;
  const { tr, at } = made;
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

export function setCodeSettings(view: EditorView, pos: number, attrs: Partial<{ variant: CodeVariant; language: string | null }>): void {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== 'codeBlock') return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function codePosAt(view: EditorView, el: Element): number | null {
  const dom = el.closest('[data-type="code-block"]');
  if (!dom || !view.dom.contains(dom)) return null;
  try {
    const pos = view.posAtDOM(dom, 0);
    for (const p of [pos, pos - 1]) if (view.state.doc.nodeAt(p)?.type.name === 'codeBlock') return p;
    return null;
  } catch { return null; }
}

export async function copyCode(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    log.warn('codeBlock', 'copy failed', errorMessage(e));
    return false;
  }
}

// ── The view ─────────────────────────────────────────────────────────────────
// The pill (design, Copy, frames, select) above a dark panel: a header with the language, then
// the line numbers (the Line numbers design) beside the code. Only the code is editable.

class CodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: PMNode;
  private editor: Editor;
  private getPos: () => number | undefined;
  private pill: HTMLElement;
  private language: HTMLSelectElement;
  private gutter: HTMLElement;
  private header: HTMLElement;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.node = node;
    this.editor = editor;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.setAttribute('data-type', 'code-block');
    this.dom.setAttribute('data-note-block', '');
    this.pill = document.createElement('div');

    const panel = document.createElement('div');
    panel.setAttribute('data-code-panel', '');
    this.header = document.createElement('div');
    this.header.setAttribute('data-code-header', '');
    this.header.contentEditable = 'false';
    const dots = document.createElement('span');
    dots.setAttribute('data-code-dots', '');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(...[0, 1, 2].map(() => document.createElement('span')));
    this.language = document.createElement('select');
    this.language.setAttribute('data-code-language', '');
    this.language.setAttribute('aria-label', LABELS.noteBlocks.code.language);
    this.language.addEventListener('change', () => {
      const p = this.getPos();
      if (p !== undefined) setCodeSettings(this.editor.view, p, { language: this.language.value || null });
    });
    this.header.append(dots, this.language);

    const body = document.createElement('div');
    body.setAttribute('data-code-body', '');
    this.gutter = document.createElement('div');
    this.gutter.setAttribute('data-code-gutter', '');
    this.gutter.setAttribute('aria-hidden', 'true');
    this.gutter.contentEditable = 'false';
    const pre = document.createElement('pre');
    this.contentDOM = document.createElement('code');
    pre.append(this.contentDOM);
    body.append(this.gutter, pre);
    panel.append(this.header, body);
    this.dom.append(this.pill, panel);
    this.render();
  }

  private pillPos = () => { const p = this.getPos(); return p === undefined ? undefined : p + 1; };

  private render() {
    const a = this.node.attrs;
    const L = LABELS.noteBlocks.code;
    const view = this.editor.view;
    const getPos = this.pillPos;
    this.dom.setAttribute('data-variant', a.variant as string);
    applyFrameAttrs(this.dom, a);

    const lang = a.language as string | null;
    const detected = lang ? null : colourCode(this.node).detected;
    const options: HTMLOptionElement[] = [new Option(detected ? L.autoDetected(languageLabel(detected)) : L.auto, '')];
    options.push(new Option(L.plainText, PLAIN_TEXT));
    for (const l of CODE_LANGUAGES) options.push(new Option(l.label, l.id));
    if (lang && lang !== PLAIN_TEXT && !CODE_LANGUAGES.some((l) => l.id === lang)) options.push(new Option(lang, lang));
    this.language.replaceChildren(...options);
    this.language.value = lang ?? '';
    this.language.disabled = !this.editor.isEditable;

    const lines = this.node.textContent.split('\n').length;
    this.gutter.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join('\n');

    const bar = blockPill('data-code-tools');
    const set = (v: CodeVariant) => { const p = this.getPos(); if (p !== undefined && view.editable) setCodeSettings(view, p, { variant: v }); };
    const copy = pillButton(L.copyTitle, () => {
      void copyCode(this.node.textContent).then((ok) => {
        copy.textContent = ok ? L.copied : L.copyFailed;
        setTimeout(() => { copy.textContent = L.copy; }, 1500);
      });
    }, L.copy);
    copy.setAttribute('data-code-tool', 'copy');
    bar.append(designButtons(CODE_DESIGNS, a.variant as CodeVariant, set), copy, frameButtons(view, getPos, a), selectButton(view, getPos));
    this.pill.replaceWith(bar);
    this.pill = bar;
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (this.pill.contains(t) || this.header.contains(t));
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }) {
    if (m.type === 'selection') return false;
    return !this.contentDOM.contains(m.target);
  }
}

export const CodeBlockExtensions = [NoteCodeBlock];
