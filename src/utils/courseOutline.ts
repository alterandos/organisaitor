import { readDate } from '@/utils/textToTask';
import { addDaysToIso } from '@/utils/date';

// Reads a course outline pasted into the "University subject" template's magic wand
// (docs/features/endeavours.md phase 6, "describe it in words"), pure. It finds what it can and
// leaves the rest, and the person checks it all before anything is made:
//   • the code ("GEOS215", "701-1253-00L") and name, from a heading or a labelled line;
//   • regular classes: a line with a weekday and a time ("Lectures: Tue and Thu 12–1pm",
//     "Time & Location⇥Thursday 16.15-18.00, HG D 5.2"), one per day, with its place;
//   • one-off classes: a class with a date or a teaching week ("Lab 1, week 4, 12-13");
//   • assessments: a date or a teaching week, a weight, a kind;
//   • readings: whether the outline mentions them.
// A teaching week counts from the start date (week 1 is the week it falls in).
// An AI reader can stand in later through the same wand (BACKLOG "Magic wand readers through the AI").

export const CLASS_TYPES = ['Lecture', 'Tutorial', 'Seminar', 'Workshop', 'Lab', 'Practical', 'Studio', 'Exercise class', 'Other'] as const;
export type ClassType = typeof CLASS_TYPES[number];

export interface OutlineClass { type: ClassType; day: number; start: string; end: string; location: string | null }
export interface OutlineOneOff { type: ClassType; title: string; date: string; start: string | null; end: string | null; location: string | null }
export interface OutlineAssessment { title: string; date: string; weight: number | null; typeName: 'Exam' | 'Essay' | 'Assessment' }
export interface CourseOutline {
  code:        string | null;
  name:        string | null;
  start:       string | null;   // "starts: 14/09/2026"
  end:         string | null;
  classes:     OutlineClass[];
  oneOffs:     OutlineOneOff[];
  readings:    boolean;
  assessments: OutlineAssessment[];
}

const DAYS: [RegExp, number][] = [
  [/\bmon(day)?s?\b/i, 1], [/\btue(s|sday)?s?\b/i, 2], [/\bwed(nesday)?s?\b/i, 3], [/\bthu(r|rs|rsday)?s?\b/i, 4],
  [/\bfri(day)?s?\b/i, 5], [/\bsat(urday)?s?\b/i, 6], [/\bsun(day)?s?\b/i, 0],
];
const CLASS_WORD: [RegExp, ClassType][] = [
  [/\blectures?\b|\bvorlesung\b/i, 'Lecture'], [/\btutorials?\b|\btutes?\b|\bübung(en)?\b|\brecitations?\b/i, 'Tutorial'],
  [/\bseminars?\b|\bcolloquium\b/i, 'Seminar'], [/\bworkshops?\b/i, 'Workshop'], [/\blabs?\b|\blaborator(y|ies)\b/i, 'Lab'],
  [/\bpracticals?\b|\bpracs?\b/i, 'Practical'], [/\bstudios?\b/i, 'Studio'], [/\bexercise (class|session)s?\b/i, 'Exercise class'],
];
const ASSESSMENT_WORDS = /\b(exam|essay|assignment|quiz|test|report|presentation|project|assessment|proposal|midterm|mid-term)(?:zes|es|s)?\b/i;
const START_LABEL = /^(starts?|start date|begins?|teaching (starts|begins)|semester (starts|begins))$/i;
const END_LABEL = /^(ends?|end date|finishes|teaching ends|semester ends)$/i;

// German month names, and "18. September", read as the date reader knows them.
const MONTHS_DE: [RegExp, string][] = [
  [/\bjanuar\b/gi, 'January'], [/\bfebruar\b/gi, 'February'], [/\bm(ä|ae)rz\b/gi, 'March'], [/\bmai\b/gi, 'May'],
  [/\bjuni\b/gi, 'June'], [/\bjuli\b/gi, 'July'], [/\boktober\b/gi, 'October'], [/\bdezember\b/gi, 'December'],
];
export function normaliseDates(line: string): string {
  let out = line.replace(/\b(\d{1,2})\.\s+(?=[A-Za-zÄÖÜäöü])/g, '$1 ');
  for (const [re, en] of MONTHS_DE) out = out.replace(re, en);
  return out;
}

// A heading for a list of assessments ("quizzes:", "Essays", "Exam") as one of them: "Quiz".
function sectionOf(line: string): string | null {
  const m = line.replace(/:\s*$/, '').trim().match(/^([A-Za-z-]+(?:\s[A-Za-z-]+)?)$/);
  if (!m || !ASSESSMENT_WORDS.test(m[1])) return null;
  const one = m[1].replace(/zzes$/i, 'z').replace(/ies$/i, 'y').replace(/(ss|sh|ch|x)es$/i, '$1').replace(/s$/i, '');
  return one.charAt(0).toUpperCase() + one.slice(1).toLowerCase();
}
// A labelled line's label: "Time & Location", "Course number", "When", "Where".
const TIME_LABEL = /^(time|times|when|schedule|time\s*(&|and)\s*location|lectures?|classes)$/i;

const pad = (n: number) => String(n).padStart(2, '0');

// "12–1pm", "10am - 12pm", "14:00–16:00", "16.15-18.00", "2 to 4pm": the start and end, 24-hour.
// A bare "12-13" counts only with `loose` (the caller knows the line is about a class), so a range
// of weeks or pages ("Week 3-4") isn't read as a time.
export function readTimeRange(line: string, loose = false): { start: string; end: string } | null {
  const m = line.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  const [, h1s, m1 = '00', ap1, h2s, m2 = '00', ap2] = m;
  if (!ap1 && !ap2 && m[2] === undefined && m[5] === undefined && !loose) return null;
  let h1 = Number(h1s), h2 = Number(h2s);
  if (h1 > 23 || h2 > 23) return null;
  const end = (ap2 ?? ap1)?.toLowerCase();
  const start = ap1?.toLowerCase() ?? end;
  if (end === 'pm' && h2 < 12) h2 += 12;
  if (start === 'pm' && h1 < 12) h1 += 12;
  // "12–1pm": the start is the earlier, so noon not midnight; "11–1pm" starts in the morning.
  if (!ap1 && end === 'pm' && h1 > h2) h1 -= 12;
  if (h1 > h2 || (h1 === h2 && m1 >= m2)) return null;
  return { start: `${pad(h1)}:${m1}`, end: `${pad(h2)}:${m2}` };
}

export function readDays(line: string): number[] {
  return DAYS.filter(([re]) => re.test(line)).map(([, d]) => d).sort((a, b) => a - b);
}

const classTypeOf = (text: string): ClassType | null => CLASS_WORD.find(([re]) => re.test(text))?.[1] ?? null;

const typeOf = (line: string): OutlineAssessment['typeName'] =>
  /\bexam\b|\bmidterm\b|\bmid-term\b/i.test(line) ? 'Exam' : /\bessay\b/i.test(line) ? 'Essay' : 'Assessment';

// A line without its links: "(https://…)" and bare addresses.
const withoutLinks = (line: string) => line.replace(/\(\s*https?:\/\/[^)]*\)/gi, '').replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();

// "Label⇥value", "Label: value", "Label   value": the label and the value, if it's a labelled line.
function labelled(line: string): { label: string; value: string } | null {
  const m = line.match(/^([A-Za-z][A-Za-z &/]{1,30}?)\s*(?:\t+|:\s+|\s{2,})(.+)$/);
  return m ? { label: m[1].trim(), value: m[2].trim() } : null;
}

// The place after a time, once the days and the time are taken out ("…, HG D 5.2", "… in Carslaw 175").
function placeIn(text: string): string | null {
  const after = text.split(/\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?/i)[1] ?? '';
  const place = after.replace(/^[\s,;]+|^(in|at|@)\s+/i, '').replace(/^(in|at|@)\s+/i, '').trim();
  return place && place.length <= 60 ? place : null;
}

// The date of a teaching week's day: week 1 is the week the start date falls in (Monday first).
export function weekDate(start: string, week: number, day: number | null): string {
  const d = new Date(start + 'T00:00:00').getDay();
  const monday = addDaysToIso(start, d === 0 ? -6 : 1 - d);
  const offset = day === null ? 0 : day === 0 ? 6 : day - 1;
  return addDaysToIso(monday, (week - 1) * 7 + offset);
}

// An assessment's or one-off class's name: the line before its date, weight or "due", tidied.
function titleOf(line: string): string {
  const head = line.split(/[:,(–—]|\bdue\b|\bweek\s*\d+|\b\d{1,2}\s*%|\d{1,2}[/.]\d{1,2}|\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i)[0].trim();
  const t = (head || line).replace(/^[-•*\d.)\s]+(?=\D)/, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function readCourseOutline(text: string, start: string | null): CourseOutline {
  // Blank lines kept: one ends a list of assessments under a heading.
  const lines = text.split(/\r?\n/).map((l) => normaliseDates(withoutLinks(l.replace(/^#+\s*/, ''))));
  const out: CourseOutline = { code: null, name: null, start: null, end: null, classes: [], oneOffs: [], readings: /\breadings?\b/i.test(text), assessments: [] };
  let now = start ? new Date(start + 'T00:00:00') : new Date();
  let section: string | null = null;
  const when = (line: string): string | null => {
    const week = line.match(/\bweek\s*(\d{1,2})\b/i);
    if (week && start) return weekDate(start, Number(week[1]), readDays(line)[0] ?? null);
    return readDate(line, now);
  };

  for (const line of lines) {
    if (!line) { section = null; continue; }
    const kv = labelled(line);

    // "starts: 14/09/2026", "ends: 16/12/2026": the teaching period (what teaching weeks count from).
    if (kv && (START_LABEL.test(kv.label) || END_LABEL.test(kv.label))) {
      const date = readDate(kv.value, now);
      if (date && START_LABEL.test(kv.label)) { out.start = date; start = date; now = new Date(date + 'T00:00:00'); }
      else if (date) out.end = date;
      continue;
    }

    // A heading for a list of assessments ("quizzes:"); the lines under it are its items, each a
    // date ("1. 18. September 2026" is Quiz 1), named from the heading.
    const heading = sectionOf(line);
    if (heading) { section = heading; continue; }
    if (section) {
      const numbered = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
      const rest = numbered ? numbered[2] : line.replace(/^[-•*]\s*/, '');
      const date = when(rest);
      if (date) {
        const weight = rest.match(/\b(\d{1,3})\s*%/);
        out.assessments.push({ title: numbered ? `${section} ${numbered[1]}` : section, date, weight: weight ? Number(weight[1]) : null, typeName: typeOf(section) });
        continue;
      }
      section = null;
    }

    // The code and name: a labelled line ("Course number⇥701-1253-00L"), or a heading ("GEOS215 Climate Systems").
    if (kv && /\b(course|unit|subject|module)\s*(number|code|no\.?|id)\b|^code$/i.test(kv.label)) {
      out.code ??= kv.value.split(/\s+/)[0];
      continue;
    }
    if (kv && /\b(course|unit|subject|module)\s*(title|name)\b|^title$/i.test(kv.label)) {
      out.name ??= kv.value;
      continue;
    }
    if (!out.code) {
      const m = line.match(/^\s*([A-Z]{2,5}\s?\d{3,4}[A-Z]?|\d{3}-\d{4}-\d{2}[A-Z]?)\b\s*[:–—-]?\s*(.*)$/);
      if (m) {
        out.code = m[1].replace(/\s/g, '');
        const rest = m[2].replace(/\(.*?\)/g, '').trim();
        if (!out.name && rest && rest.length <= 60 && !classTypeOf(rest) && !ASSESSMENT_WORDS.test(rest)) out.name = rest;
        continue;
      }
    }

    const body = kv ? kv.value : line;
    const typeHere = classTypeOf(kv ? `${kv.label} ${kv.value}` : line);
    const days = readDays(body);
    const isAssessment = ASSESSMENT_WORDS.test(line) && !typeHere;
    const time = readTimeRange(body, !!typeHere || days.length > 0 || (!!kv && TIME_LABEL.test(kv.label)));
    const dated = /\bweek\s*\d{1,2}\b/i.test(line) || (!days.length && !!readDate(line, now));

    // A one-off class: a class with a date or a teaching week.
    if (typeHere && dated && !isAssessment) {
      const date = when(line);
      if (date) {
        out.oneOffs.push({ type: typeHere, title: titleOf(line) || typeHere, date, start: time?.start ?? null, end: time?.end ?? null, location: time ? placeIn(body) : null });
        continue;
      }
    }

    // A regular class: a weekday and a time ("Time & Location⇥Thursday 16.15-18.00, HG D 5.2").
    // A line may hold several ("Wednesday 10-12, Friday 1-2pm, Carslaw 175"): each part's days take
    // the time that follows them; a last part with neither is the place, for all of them.
    if (time && days.length > 0 && !isAssessment && (typeHere || (kv && TIME_LABEL.test(kv.label)) || !ASSESSMENT_WORDS.test(line))) {
      const type = typeHere ?? 'Lecture';
      const made: OutlineClass[] = [];
      let pending: number[] = [];
      let place: string | null = null;
      for (const part of body.split(/\s*[;,]\s*/)) {
        const d = readDays(part);
        const t = readTimeRange(part, true);
        pending.push(...d);
        if (t && pending.length) {
          for (const day of pending) made.push({ type, day, ...t, location: placeIn(part) });
          pending = [];
        } else if (!d.length && !t && made.length && part) place = part.replace(/^(in|at|@)\s+/i, '').trim();
      }
      for (const c of made) {
        const located = { ...c, location: c.location ?? place };
        if (!out.classes.some((x) => x.type === c.type && x.day === c.day && x.start === c.start)) out.classes.push(located);
      }
      continue;
    }

    if (ASSESSMENT_WORDS.test(line)) {
      const date = when(line);
      if (!date) continue;
      const weight = line.match(/\b(\d{1,3})\s*%/);
      out.assessments.push({ title: titleOf(line), date, weight: weight ? Number(weight[1]) : null, typeName: typeOf(line) });
    }
  }
  return out;
}
