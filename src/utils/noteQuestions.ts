import type { Note } from '@/types/notes';

// Questions in notes (the `\question` block, NoteEditor/extensions/Question.ts), read from a note's
// stored JSON: for the Overview's "Questions" and anything else that lists them across notes.

export type QuestionStatus = 'open' | 'answered' | 'dropped';

export interface QuestionRef {
  qid:      string;
  text:     string;
  status:   QuestionStatus;
  followUp: string | null;
  noteId:   string;
  noteTitle: string;
  tabId:    string | null;
}

interface JsonNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

const textOf = (n: JsonNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

export function questionsInContent(json: string): Omit<QuestionRef, 'noteId' | 'noteTitle' | 'tabId'>[] {
  if (!json || !json.includes('questionBlock')) return [];
  const out: Omit<QuestionRef, 'noteId' | 'noteTitle' | 'tabId'>[] = [];
  const walk = (n: JsonNode) => {
    if (n.type === 'questionBlock') {
      const a = n.attrs ?? {};
      const text = n.content?.[0] ? textOf(n.content[0]).trim() : '';
      const status = (['open', 'answered', 'dropped'] as const).find((s) => s === a.status) ?? 'open';
      if (typeof a.qid === 'string' && a.qid) out.push({ qid: a.qid, text, status, followUp: typeof a.followUp === 'string' ? a.followUp : null });
      return;
    }
    n.content?.forEach(walk);
  };
  try { walk(JSON.parse(json) as JsonNode); } catch { /* unreadable content: no questions */ }
  return out;
}

export function collectQuestions(notes: Iterable<Note>): QuestionRef[] {
  const out: QuestionRef[] = [];
  for (const n of notes) {
    if (n.archivedAt) continue;
    const add = (json: string, tabId: string | null) => {
      for (const q of questionsInContent(json)) out.push({ ...q, noteId: n.id, noteTitle: n.title, tabId });
    };
    add(n.content, null);
    for (const t of n.tabs) add(t.content, t.id);
  }
  return out;
}

// What a question is about, for the card that answers it: "What is osmosis?" → "osmosis",
// "What does ASX stand for?" → "ASX". The question as typed (without its "?") when no pattern fits.
export function questionSubject(question: string): string {
  const q = question.trim().replace(/[?？]+$/u, '').trim();
  const patterns: RegExp[] = [
    /^what\s+(?:does|do)\s+(.+?)\s+(?:stand for|mean)$/iu,
    /^what(?:'s|\s+is|\s+are|\s+was|\s+were)\s+(?:an?\s+|the\s+)?(.+)$/iu,
    /^(?:who|which)\s+(?:is|are|was|were)\s+(?:an?\s+|the\s+)?(.+)$/iu,
    /^(?:define|explain)\s+(.+)$/iu,
    /^(?:how\s+does|how\s+do)\s+(.+?)\s+work$/iu,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return q;
}
