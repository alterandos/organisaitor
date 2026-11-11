import type { Note } from '@/types/notes';

// An AI prompt kept in a note (the `\prompt` block, NoteEditor extensions/Prompt.ts; agreed with
// the user 2026-11-11): a skeleton reused run after run. Its sections are the person's own
// headings, each either kept (the background sent every time) or filled in each run; its fill-ins
// are named gaps (`{project}`) written into any section and filled in once per run. Pure: what a
// prompt is, how it's put together for sending, what a fresh run starts from, and where the
// templates are. Sending it anywhere is services/aiPromptTargets.ts.

export interface PromptSection {
  id:     string;
  name:   string;
  text:   string;
  perRun: boolean;   // emptied for a new run; else kept
  // Its heading's level, 1–6 (2 when never set: `## Name`, as every section was before levels,
  // 2026-11-11), and whether it's folded away while being worked on (it and the sections under it).
  level?:  number;
  folded?: boolean;
}

export const DEFAULT_SECTION_LEVEL = 2;
export const sectionLevel = (s: Pick<PromptSection, 'level'>): number =>
  Number.isInteger(s.level) && s.level! >= 1 && s.level! <= 6 ? s.level! : DEFAULT_SECTION_LEVEL;

// Which sections are out of sight because a section above them is folded: a folded section keeps
// its heading and hides its text and every section under it (a deeper level), as headings fold
// in a note.
export function hiddenByFolds(sections: readonly PromptSection[]): { textHidden: Set<string>; hidden: Set<string> } {
  const textHidden = new Set<string>();
  const hidden = new Set<string>();
  let foldedAt: number | null = null;
  for (const s of sections) {
    const level = sectionLevel(s);
    if (foldedAt !== null && level > foldedAt) { hidden.add(s.id); continue; }
    foldedAt = s.folded ? level : null;
    if (s.folded) textHidden.add(s.id);
  }
  return { textHidden, hidden };
}

// ── Reading Markdown into sections ───────────────────────────────────────────
// A prompt written elsewhere (Markdown, with `#` headings) pasted into the block fills it in as
// sections rather than one long text (asked for by the user 2026-11-11): each heading starts a
// section at its level, the lines under it its text (lists and all, kept as written, since that's
// what's sent). A lone `# Title` on the first line names the prompt. Headings inside ``` code
// aren't headings. Null when the text has no heading (an ordinary paste).

export interface MarkdownPrompt {
  title:    string | null;
  lead:     string;                                            // before the first heading
  sections: { name: string; level: number; text: string }[];
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

export function readMarkdownPrompt(text: string): MarkdownPrompt | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections: MarkdownPrompt['sections'] = [];
  const lead: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (/^ {0,3}(```|~~~)/.test(line)) inCode = !inCode;
    const m = inCode ? null : HEADING.exec(line);
    if (m) { sections.push({ name: m[2].trim(), level: m[1].length, text: '' }); continue; }
    const into = sections[sections.length - 1];
    if (into) into.text += (into.text || line.trim() ? `${into.text ? '\n' : ''}${line}` : '');
    else lead.push(line);
  }
  if (!sections.length) return null;
  for (const s of sections) s.text = s.text.replace(/\s+$/, '');
  let title: string | null = null;
  const ones = sections.filter((s) => s.level === 1);
  if (!lead.join('').trim() && ones.length === 1 && sections[0] === ones[0] && !ones[0].text.trim() && sections.length > 1) {
    title = ones[0].name;
    sections.shift();
  }
  return { title, lead: lead.join('\n').trim(), sections };
}

// Puts what was read into the prompt, where it was pasted: the lead in place of the selection in
// that section (or nowhere, pasted in the title), then the sections after it; a section that was
// empty and unnamed takes the first heading itself. The title only when the prompt has none.
export function pasteMarkdownPrompt(
  data: Pick<PromptData, 'title' | 'sections'>,
  at: { sectionId: string; from: number; to: number } | null,
  md: MarkdownPrompt,
  newId: () => string,
): Pick<PromptData, 'title' | 'sections'> {
  const made = (s: MarkdownPrompt['sections'][number]): PromptSection => ({ id: newId(), name: s.name, text: s.text, level: s.level, perRun: false });
  const sections = [...data.sections];
  let index = at ? sections.findIndex((s) => s.id === at.sectionId) : -1;
  let rest = md.sections;
  if (index >= 0 && at) {
    const s = sections[index];
    const text = s.text.slice(0, at.from) + md.lead + s.text.slice(at.to);
    if (!text.trim() && !s.name.trim() && rest.length) {
      sections[index] = { ...s, name: rest[0].name, level: rest[0].level, text: rest[0].text };
      rest = rest.slice(1);
    } else sections[index] = { ...s, text };
  } else {
    // In the title: after the last section, or in place of the one empty section a prompt starts with.
    const blank = sections.length === 1 && !sections[0].text.trim() && !sections[0].name.trim();
    if (blank && rest.length) { sections[0] = { ...sections[0], name: rest[0].name, level: rest[0].level, text: rest[0].text }; rest = rest.slice(1); }
    index = sections.length - 1;
  }
  sections.splice(index + 1, 0, ...rest.map(made));
  return { title: data.title.trim() ? data.title : (md.title ?? data.title), sections };
}

export interface PromptFill {
  name:  string;
  value: string;
}

export interface PromptData {
  title:    string;
  sections: PromptSection[];
  fills:    PromptFill[];
  template: boolean;
}

// `{name}`: a letter or digit first, then letters, digits, spaces, _ or -, up to 40. So `{ "a": 1 }`
// (code, JSON) is never read as one.
const FILL = /\{([\p{L}\p{N}][\p{L}\p{N} _-]{0,39})\}/gu;
const key = (name: string) => name.trim().toLowerCase();

// The fill-in names a text uses, in order, each once.
export function fillsIn(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(FILL)) {
    const name = m[1].trim();
    if (seen.has(key(name))) continue;
    seen.add(key(name));
    out.push(name);
  }
  return out;
}

// The fill-ins with any the sections use but the prompt doesn't list yet added, in the order the
// sections use them. A fill-in no section uses is kept (it may have been added first, to use next).
export function withUsedFills(data: Pick<PromptData, 'sections' | 'fills'>): PromptFill[] {
  const have = new Set(data.fills.map((f) => key(f.name)));
  const added: PromptFill[] = [];
  for (const s of data.sections) {
    for (const name of fillsIn(s.text)) {
      if (have.has(key(name))) continue;
      have.add(key(name));
      added.push({ name, value: '' });
    }
  }
  return added.length ? [...data.fills, ...added] : data.fills;
}

// Whether any section uses this fill-in.
export const fillUsed = (sections: PromptSection[], name: string): boolean =>
  sections.some((s) => fillsIn(s.text).some((n) => key(n) === key(name)));

export interface AssembledPrompt {
  text:    string;
  missing: string[];   // fill-ins used but left empty: kept as {name} in the text
}

// A heading with nothing of its own that heads sections with text ("Instructions" over "Orient
// first") is still sent, so the outline reads as written.
function hasTextBelow(sections: readonly PromptSection[], s: PromptSection): boolean {
  const level = sectionLevel(s);
  for (const next of sections.slice(sections.indexOf(s) + 1)) {
    if (sectionLevel(next) <= level) return false;
    if (next.text.trim()) return true;
  }
  return false;
}

// The prompt as sent: each section with something in it under its heading (Markdown, its level's
// `#`s: `## Name` by default), its fill-ins put in. One section with no name is just its text.
export function assemblePrompt(data: Pick<PromptData, 'sections' | 'fills'>): AssembledPrompt {
  const values = new Map(data.fills.map((f) => [key(f.name), f.value.trim()]));
  const missing: string[] = [];
  const fill = (text: string) => text.replace(FILL, (whole, name: string) => {
    const v = values.get(key(name));
    if (v) return v;
    if (!missing.some((m) => key(m) === key(name))) missing.push(name.trim());
    return whole;
  });
  const used = data.sections.filter((s) => s.text.trim());
  const text = used.length === 1 && !used[0].name.trim()
    ? fill(used[0].text.trim())
    : data.sections.filter((s) => s.text.trim() || (s.name.trim() && hasTextBelow(data.sections, s)))
      .map((s) => (s.name.trim() ? `${'#'.repeat(sectionLevel(s))} ${s.name.trim()}` : '') + (s.text.trim() ? `${s.name.trim() ? '\n\n' : ''}${fill(s.text.trim())}` : ''))
      .join('\n\n');
  return { text, missing };
}

// What a new run starts from: the same prompt with each-run sections and the fill-ins emptied;
// never a template itself.
export function freshRun(data: PromptData): PromptData {
  return {
    title:    data.title,
    sections: data.sections.map((s) => (s.perRun ? { ...s, text: '' } : s)),
    fills:    data.fills.map((f) => ({ ...f, value: '' })),
    template: false,
  };
}

// The node's attributes read as a prompt (anything missing or malformed falls back).
export function promptData(attrs: Record<string, unknown>): PromptData {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    title:    s(attrs.title),
    sections: arr(attrs.sections).map((x: Record<string, unknown>, i) => ({
      id: s(x?.id) || `s${i}`, name: s(x?.name), text: s(x?.text), perRun: !!x?.perRun,
      ...(typeof x?.level === 'number' ? { level: x.level } : {}), ...(x?.folded ? { folded: true } : {}),
    })),
    fills:    arr(attrs.fills).map((x: Record<string, unknown>) => ({ name: s(x?.name), value: s(x?.value) })).filter((f) => f.name.trim()),
    template: !!attrs.template,
  };
}

export const promptIsEmpty = (d: PromptData): boolean => !d.title.trim() && d.sections.every((s) => !s.text.trim() && !s.name.trim());

// ── Templates: prompts marked as one, found in the notes when asked (never stored apart) ────

export interface PromptTemplateRef {
  noteId:    string;
  noteTitle: string;
  data:      PromptData;
}

interface JsonNode { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

// Every template prompt in one stored content JSON string.
export function promptTemplatesInContent(json: string): PromptData[] {
  if (!json || !json.includes('"promptBlock"')) return [];
  const out: PromptData[] = [];
  const walk = (n: JsonNode) => {
    if (n.type === 'promptBlock') { if (n.attrs?.template) out.push(promptData(n.attrs)); return; }
    n.content?.forEach(walk);
  };
  try { walk(JSON.parse(json)); } catch { return []; }
  return out;
}

// Every template in the given notes (pass only readable ones), by title.
export function collectPromptTemplates(notes: Iterable<Note>): PromptTemplateRef[] {
  const out: PromptTemplateRef[] = [];
  for (const n of notes) {
    if (n.archivedAt) continue;
    for (const json of [n.content, ...n.tabs.map((t) => t.content)]) {
      for (const data of promptTemplatesInContent(json)) out.push({ noteId: n.id, noteTitle: n.title, data });
    }
  }
  return out.sort((a, b) => (a.data.title || '').localeCompare(b.data.title || ''));
}
