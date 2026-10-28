// The demo account: one believable semester of a second-year Earth Sciences student, built through
// the stores' own actions so every default, shadow and link is set the way the app sets it. It
// touches every app and shows off Notes most of all (every note block, the Glossary, hubs,
// inboxes, links and embeds between notes) and how notes, tasks and the calendar link together.
// demoAccount.test.ts checks it against the editor's real schema and, with DEMO_OUT set, writes
// it as a backup file to restore into the demo account (see docs/features/implemented-features.md
// "Demo account").
//
// Dates are days from `base` (the day it's generated), so regenerating moves the semester along.
import { nanoid } from 'nanoid';
import { usePinnedItemsStore } from '@/store/pinnedItemsStore';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useScheduleStore } from '@/store/scheduleStore';
import { useTrackerStore } from '@/store/trackerStore';
import { useRoutineStore } from '@/store/routineStore';
import { useNoteStore } from '@/store/noteStore';
import { useListStore } from '@/store/listStore';
import { useFitnessStore } from '@/store/fitnessStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useOverviewStore } from '@/store/overviewStore';
import { useConverterStore } from '@/store/converterStore';
import { useGoalStore } from '@/store/goalStore';
import { addTaskWithCalendar } from '@/services/taskCalendarLinks';
import { linkTaskToEvent } from '@/services/eventTaskLinks';
import { addStarterSet, applyItemType, setItemType } from '@/services/itemTypes';
import { saveStreams, setTick } from '@/services/rhythms';
import { rhythmOccurrences, tickIndex } from '@/utils/rhythms';
import { STREAM_KINDS } from '@/config/streamKinds';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { editNoteContent } from '@/services/noteContentEdit';
import { pictureRef } from '@/services/pictures';
import { MAIN_TAB_ID } from '@/utils/noteTabs';
import { DICTIONARY_TYPE_ID, DICT_FIELDS } from '@/services/dictionary';
import { SWATCHES, type SwatchId } from '@/config/swatches';
import { LABELS } from '@/config/labels';
import { node, kids, bold, italic, sub, sup, weblink, p, pId, h, bullets, numbered, table, section, columns, doc, important, tagged, itemLink, noteLink, termLink, hubPassage, unsure, chip, mathInline, card, embed, mathBlock } from './noteContent';
import { EX } from './blockExamples';
import type { ActivityTypeId } from '@/types/fitness';
import type { CollectionId, CrossAppRef, NoteId, NoteTagId, PictureId, RhythmStream, StreamKind, StreamRule, TagId, TaskId } from '@/types';
import type { ListId, ListTypeId } from '@/types/lists';

// ── Dates ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── Note content ─────────────────────────────────────────────────────────────

const BOOKS = 'lt-books' as ListTypeId;

// ── The account ──────────────────────────────────────────────────────────────

// Pictures already in the library (src/demo/resources, added by loadDemo.ts), by slot. Each is
// optional: a slot without a picture is simply left out.
export interface DemoPictures { quartz?: PictureId; kiama?: PictureId }

// What the loader needs afterwards: where to put backdrops, stickies and the "last opened" note.
export interface DemoAccount {
  notebooks: { university: NoteTagId; geos201: NoteTagId; geos215: NoteTagId };
  notes: { welcome: NoteId; rock: NoteId; minerals: NoteId; trip: NoteId; carbon: NoteId; essay: NoteId; hub: NoteId };
  tasks: { packKit: TaskId; draft: TaskId };
}

export function buildDemoAccount(base: Date, pictures: DemoPictures = {}): DemoAccount {
  const day = (offset: number) => { const d = new Date(base); d.setDate(d.getDate() + offset); return isoDay(d); };
  const at = (offset: number, time: string) => new Date(`${day(offset)}T${time}:00`).toISOString();
  const colour = (id: SwatchId) => SWATCHES.find((s) => s.id === id)!.hex;
  // The weekday `dow` (0 Sun … 6 Sat) on or after base.
  const nextDow = (dow: number) => (dow - base.getDay() + 7) % 7;

  const tasks = useTaskStore.getState();
  const cal = useCalendarStore.getState();
  const notes = useNoteStore.getState();
  const lists = useListStore.getState();

  // ── Purposes, tags, Endeavours ──
  const honours = tasks.addPurpose({ name: 'Graduate with first-class honours', description: 'Keep my average above 80 and get a strong thesis supervisor.', color: colour('indigo') });
  const outdoors = tasks.addPurpose({ name: 'Stay fit and get outdoors', description: 'Fieldwork is easier when I am fit, and the hills are why I chose geology.', color: colour('green') });

  const tag = (name: string, c: SwatchId, notesText: string | null = null): TagId => {
    const id = nanoid() as TagId;   // never a fixed id: a row's id is unique across every account
    useTaskStore.getState().addTag({ id, name, color: colour(c), notes: notesText });
    return id;
  };
  const uniTag = tag('uni', 'blue');
  const readingTag = tag('reading', 'teal', 'Papers and chapters to get through.');
  const errandTag = tag('errand', 'orange');

  const fieldReport = tasks.addCollection({ kind: 'project', name: 'Field trip report', description: 'GEOS201: a 2,000-word report on the Kiama coast field trip.', color: colour('teal'), deadline: day(18), purposeIds: [honours], tagIds: [uniTag] });
  const essay = tasks.addCollection({ kind: 'project', name: 'Climate essay', description: 'GEOS215: Is solar geoengineering a responsible response to climate change? 2,500 words.', color: colour('indigo'), deadline: day(25), purposeIds: [honours], tagIds: [uniTag] });
  const admin = tasks.addCollection({ kind: 'list', name: 'Uni admin', description: 'Fees, forms and the library.', color: colour('grey') });
  // The semester the two assignments and the admin are part of (Endeavour links, 2026-10-28): choose
  // it in the Endeavour filter and everything in all three shows.
  const semester = tasks.addCollection({ kind: 'list', name: 'Semester 2', description: 'Second-year Earth Sciences: GEOS201 and GEOS215.', color: colour('blue'), purposeIds: [honours], tagIds: [uniTag] });
  for (const part of [fieldReport, essay, admin]) tasks.addEndeavourLink(part, 'partOf', semester);

  // ── Notebooks ──
  const uni = notes.addNoteTag({ name: 'University', kind: 'area', icon: '🎓', color: colour('blue') });
  const geos201 = notes.addNoteTag({ name: 'GEOS201 Mineralogy & Petrology', kind: 'area', parentTagId: uni, icon: '🪨', color: colour('orange') });
  const geos215 = notes.addNoteTag({ name: 'GEOS215 Climate Systems', kind: 'area', parentTagId: uni, icon: '🌍', color: colour('cyan') });
  const examTag = notes.addNoteTag({ name: 'Exam topic', kind: 'tag', icon: '🎯', color: colour('red'), description: 'Likely to come up in the exam.' });

  const newNote = (title: string, tagIds: NoteTagId[], collectionId: CollectionId | null = null): NoteId =>
    notes.addNote({ title, tagIds, collectionId });
  const welcome = newNote('Start here: my semester', [uni]);
  const rock = newNote('The rock cycle', [geos201]);
  const lab = newNote('Lab 3: hand samples', [geos201]);
  const minerals = newNote('Identifying minerals', [geos201]);
  const time = newNote('Geological time', [geos201]);
  const trip = newNote('Field trip: Kiama coast', [geos201], fieldReport);
  const carbon = newNote('Week 6: the carbon cycle and Earth’s energy budget', [geos215]);
  const essayNote = newNote('Essay: is solar geoengineering responsible?', [geos215], essay);
  const hubNote = newNote('Feedback loops in the Earth system', [geos215]);
  useNoteStore.getState().updateNote(lab, { parentId: rock });
  useNoteStore.getState().updateNote(welcome, { color: colour('blue'), abstract: 'Where everything for semester 2 lives, and the shortcuts I keep forgetting.' });
  useNoteStore.getState().updateNote(essayNote, { abstract: 'Thesis: research it, but don’t deploy it. Due in under four weeks.' });
  useNoteStore.getState().updateNote(trip, { color: colour('teal') });

  // ── Glossary records (each shown by a card or chip in its own note, below) ──
  const entry = (typeKey: string, term: string, noteId: NoteId, fields: Record<string, unknown>, collectionId: CollectionId | null = null) =>
    useNoteStore.getState().addStructuredTagEntry({ typeKey, tagId: `builtin-${typeKey}`, term, fields, noteId, collectionId });
  const lithification = entry('definition', 'Lithification', rock, {
    meaning: 'The process by which loose sediment is compacted and cemented into solid sedimentary rock.',
    example: 'Sand buried under kilometres of younger sediment slowly lithifies into sandstone.',
    source: 'GEOS201 Lecture 4',
  });
  const albedo = entry('definition', 'Albedo', carbon, {
    meaning: 'The fraction of incoming sunlight a surface reflects, from 0 (absorbs everything) to 1 (reflects everything).',
    example: 'Fresh snow has an albedo of about 0.8; open ocean about 0.06.',
    source: 'GEOS215 Week 6',
    weblinks: ['https://en.wikipedia.org/wiki/Albedo'],
  });
  const ipcc = entry('acronym', 'IPCC', carbon, {
    expansion: 'Intergovernmental Panel on Climate Change',
    meaning: 'The UN body that assesses the science of climate change for governments.',   // also a definition (glossaryKinds)
    explanation: 'The UN body that assesses climate science. Its Assessment Reports (AR6 is the latest) are the reference for the essay.',
    weblinks: ['https://www.ipcc.ch'],
  });
  const feedback = entry('concept', 'Climate feedback', carbon, {
    summary: 'A change that a warming (or cooling) sets off, which then makes the original change bigger or smaller.',
    explanation: 'Positive feedbacks amplify a change; negative feedbacks damp it. Climate sensitivity depends mostly on the balance between them.',
    keyPoints: ['Positive feedbacks amplify, negative feedbacks stabilise', 'Water vapour is the largest positive feedback', 'Feedbacks act on very different timescales'],
    examples: ['Ice–albedo feedback', 'Water vapour feedback', 'Silicate weathering (negative, over millions of years)'],
    nonExamples: ['A forcing, such as adding CO₂: that starts the change rather than responding to it'],
    related: [{ kind: 'dependsOn', entryId: albedo }],
    importance: 1,   // a Key concept (BlockImportance.ts): shows in its card, hover card and the Glossary filter
  });
  const quartz = entry('profile', 'Quartz', minerals, {
    summary: 'The most common mineral in the continental crust, and the one I keep mistaking for calcite.',
    facts: [
      { label: 'Formula', value: 'SiO₂' }, { label: 'Hardness', value: '7 (Mohs)' },
      { label: 'Crystal system', value: 'Trigonal' }, { label: 'Lustre', value: 'Vitreous' }, { label: 'Fracture', value: 'Conchoidal' },
    ],
    about: 'Scratches glass, doesn’t fizz in acid, and breaks with curved, shell-like surfaces instead of cleaving.',
    sources: ['Klein & Dutrow, Manual of Mineral Science, ch. 18'],
    ...(pictures.quartz ? { image: pictureRef(pictures.quartz) } : {}),
  });
  const xrd = entry('acronym', 'XRD', minerals, { expansion: 'X-ray diffraction', explanation: 'Identifies a mineral from how its crystal lattice scatters X-rays. The lab runs it on our powdered samples.' });
  const latite = entry('definition', 'Latite', trip, {
    meaning: 'A fine-grained volcanic rock between trachyte and andesite in composition. The Kiama coast is built of it.',
    example: 'The columns at the Kiama Blowhole are latite, about 260 million years old.',
  }, fieldReport);

  // ── Tasks (dates through the store, so their calendar shadows are made too) ──
  const T = (input: Parameters<typeof addTaskWithCalendar>[0]) => addTaskWithCalendar(input);
  const noteRef = (id: NoteId): CrossAppRef => ({ type: 'note', id });

  const packKit = T({ title: 'Pack the field kit', collectionId: fieldReport, scheduledAt: day(3), scheduledTime: '19:00', priority: 'medium', timeIntensity: 'low', crossAppRefs: [noteRef(trip)], notes: 'Everything on the packing list. Charge the GPS the night before.' });
  const logSamples = T({ title: 'Log the hand samples in Records', collectionId: fieldReport, scheduledAt: day(5), timeIntensity: 'medium', crossAppRefs: [noteRef(trip), noteRef(lab)] });
  const methods = T({ title: 'Write the methods section', collectionId: fieldReport, deadline: day(10), priority: 'medium', timeIntensity: 'high', crossAppRefs: [noteRef(trip)] });
  T({ title: 'Map of the sample sites', parentId: methods });
  T({ title: 'Describe how each sample was taken', parentId: methods });
  const discussion = T({ title: 'Draft the discussion', collectionId: fieldReport, deadline: day(14), timeIntensity: 'high' });
  const submitReport = T({ title: 'Submit the field trip report', kind: 'milestone', collectionId: fieldReport, deadline: day(18), deadlineTime: '17:00', priority: 'high', crossAppRefs: [noteRef(trip)] });

  const readIpcc = T({ title: 'Read the IPCC AR6 Summary for Policymakers', collectionId: essay, tagIds: [uniTag, readingTag], links: ['https://www.ipcc.ch/report/ar6/syr/'], timeIntensity: 'medium' });
  const outline = T({ title: 'Outline the essay argument', collectionId: essay, scheduledAt: day(1), scheduledTime: '14:00', crossAppRefs: [noteRef(essayNote)] });
  const draft = T({ title: 'Write the first draft', collectionId: essay, scheduledAt: day(7), scheduledTime: '10:00', deadline: day(14), priority: 'medium', timeIntensity: 'high', crossAppRefs: [noteRef(essayNote)] });
  const askTutor = T({ title: 'Hear back from my tutor about the word limit', kind: 'waiting', collectionId: essay, notes: 'Emailed on Monday. Does the reference list count?' });
  T({ title: 'Find two papers on termination shock', collectionId: essay, tagIds: [readingTag], priority: 'low' });

  T({ title: 'Renew library loans', collectionId: admin, deadline: day(2), repeat: { freq: 'weekly', interval: 2, endKind: 'forever', count: null, until: null } });
  const fee = T({ title: 'Pay the student services fee', collectionId: admin });
  T({ title: 'Buy a new hand lens (10×)', tagIds: [errandTag], priority: 'low', deadline: day(2), notes: 'The geology shop near the station has them. Mine fell in a rock pool.' });

  useTaskStore.getState().toggleTask(readIpcc);
  useTaskStore.getState().archiveTask(fee, 'Paid at the start of semester');
  const link = useTaskStore.getState().addItemLink;
  link(outline, 'followUpOf', readIpcc);
  link(draft, 'dependsOn', outline, 'Need the structure first');
  link(discussion, 'dependsOn', logSamples, 'The discussion is about the samples');
  link(submitReport, 'dependsOn', methods);
  link(submitReport, 'dependsOn', discussion);
  link(draft, 'related', askTutor);

  // ── Calendar ──
  const fieldTrip = cal.addEvent({ title: 'Field trip: Kiama coast', date: day(4), startTime: '07:00', endTime: '17:30', location: 'Kiama Blowhole, NSW', collectionId: fieldReport, important: true, notifyBeforeValue: 1, notifyBeforeUnit: 'days', crossAppRefs: [noteRef(trip)], notes: 'Bus leaves from the Earth Sciences car park. Bring lunch.' });
  const consult = cal.addEvent({ title: 'Consult with my tutor about the essay', date: day(9), startTime: '11:00', endTime: '11:30', location: 'Room 4.12, Madsen Building', status: 'tentative', collectionId: essay, crossAppRefs: [noteRef(essayNote)] });
  const midsem = cal.addEvent({ title: 'Climate Systems mid-semester exam', date: day(12), startTime: '09:00', endTime: '11:00', location: 'Exam Hall B', important: true, crossAppRefs: [noteRef(carbon)] });
  // Tasks linked to the exam (utils/eventTaskLinks.ts): revision due when it starts, a follow-up after.
  const revise = T({ title: 'Revise the carbon cycle lectures', scheduledAt: day(5), crossAppRefs: [noteRef(carbon)] });
  linkTaskToEvent(revise, 'prepFor', 'event', midsem);
  linkTaskToEvent(T({ title: 'Go over the exam feedback' }), 'followUpOf', 'event', midsem);
  cal.addEvent({ title: 'Study group', date: day(nextDow(4)), startTime: '16:00', endTime: '17:30', location: 'Fisher Library, level 3', repeat: { freq: 'weekly', interval: 1, endKind: 'count', count: 10, until: null } });
  cal.addEvent({ title: 'Geology club trivia night', date: day(6), startTime: '19:00', endTime: '21:00', location: 'Uni bar' });
  cal.addEvent({ title: 'Mid-semester break', date: day(20), endDate: day(26), background: true });
  const bookBus = cal.addReminder({ title: 'Book a seat on the field-trip bus', date: day(1), time: '09:00', collectionId: fieldReport, crossAppRefs: [noteRef(trip)] });
  cal.addReminder({ title: 'Charge the camera and GPS', date: day(3), time: '20:00', collectionId: fieldReport });
  const essayDue = cal.addDeadline({ title: 'Climate essay due', date: day(25), time: '23:59', collectionId: essay, important: true, notifyDaysBefore: 3, crossAppRefs: [noteRef(essayNote)] });
  const labDue = cal.addDeadline({ title: 'Lab 3 worksheet due', date: day(2), time: '17:00', crossAppRefs: [noteRef(lab)] });

  // ── Types (docs/features/endeavours.md phase 3): the University starter set, and the semester's
  // assessments given their Type and values. Their parts already exist above, so none are made,
  // except the essay's proofread.
  addStarterSet('university');
  const typeNamed = (name: string) => Object.values(useItemTypeStore.getState().types).find((x) => x.name === name)!.id;
  applyItemType({ kind: 'event', id: midsem }, typeNamed('Exam'), { weight: 30, room: 'Exam Hall B', materials: 'One A4 page of notes, both sides', status: 'Not started' }, []);
  applyItemType({ kind: 'deadline', id: essayDue }, typeNamed('Essay'), { weight: 40, words: 2000, question: 'Should we research solar geoengineering?', status: 'In progress' }, ['proofread']);
  applyItemType({ kind: 'deadline', id: labDue }, typeNamed('Assessment'), { weight: 5, status: 'In progress' }, []);
  setItemType({ kind: 'task', id: readIpcc }, typeNamed('Reading'), { source: 'IPCC AR6 Synthesis Report, Summary for Policymakers', pages: '1–36' });

  const block = (id: string, title: string, daysOfWeek: number[], startTime: string, endTime: string, location: string) =>
    ({ id, title, daysOfWeek, startTime, endTime, location, interval: 1, intervalAnchor: day(0), exceptions: [], notes: null, requiresCommitment: false, committedDates: [] });
  const timetable = useScheduleStore.getState().addSchedule({
    name: 'Semester 2 timetable', color: colour('blue'), startDate: day(-56), endDate: day(42),
    blocks: [
      block('geos201l', 'GEOS201 lecture', [1, 3], '10:00', '11:00', 'Earth Sciences LT1'),
      block('geos201p', 'GEOS201 lab', [2], '14:00', '17:00', 'Petrology lab, room 210'),
      block('geos215l', 'GEOS215 lecture', [2, 4], '12:00', '13:00', 'Carslaw 175'),
      block('geos215t', 'GEOS215 tutorial', [5], '09:00', '10:00', 'Madsen 4.12'),
    ],
  });

  // ── A rhythm (docs/features/endeavours.md phase 4): GEOS215 week by week, part of Semester 2.
  // The lectures follow the timetable, the reading is due the day before each, the quiz each
  // Friday. Ticks for the last fortnight, with one reading missed (it shows as behind).
  const readingStream = nanoid(8);
  const weekly = useTaskStore.getState().addCollection({ kind: 'routine', name: 'GEOS215 each week', color: colour('cyan') });
  useTaskStore.getState().updateCollection(weekly, { collectionId: semester });
  const stream = (id: string, label: string, kind: StreamKind, rule: StreamRule, extra: Partial<RhythmStream> = {}): RhythmStream =>
    ({ id, label, kind, rule, typeId: null, start: day(-21), time: null, show: { ...STREAM_KINDS[kind].show }, notebookId: geos215, ...extra });
  saveStreams(weekly, [
    stream(nanoid(8), 'Lecture', 'attend', { kind: 'relative', scheduleId: timetable, blockId: 'geos215l', offsetDays: 0 }),
    stream(readingStream, 'Reading', 'doBy', { kind: 'relative', scheduleId: timetable, blockId: 'geos215l', offsetDays: -1 }, { typeId: typeNamed('Reading') }),
    stream(nanoid(8), 'Tutorial quiz', 'submit', { kind: 'repeat', repeat: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [5] } }, { time: '17:00' }),
  ]);
  {
    const rhythm = useTaskStore.getState().collections[weekly];
    const ticks = tickIndex(useTrackerStore.getState().entries, useTaskStore.getState().collections);
    const missed = rhythmOccurrences(rhythm, useScheduleStore.getState().schedules, ticks, day(-14), day(-1), day(0))
      .filter((o) => o.stream.label === 'Reading').at(-1)?.key;
    for (const o of rhythmOccurrences(rhythm, useScheduleStore.getState().schedules, ticks, day(-14), day(-1), day(0))) {
      if (o.key !== missed) setTick(weekly, o.stream.id, o.date, 'done');
    }
  }

  // ── Lists ──
  const packing = lists.addList({ name: 'Field trip packing list', kind: 'checklist', icon: '🎒', color: colour('teal'), collectionId: fieldReport, resetOnTaskComplete: true });
  ['Hand lens', 'Rock hammer', 'Safety glasses', 'Field notebook and pencils', 'Sample bags and a marker', 'GPS (charged)', 'Raincoat', 'Lunch and 2 L of water']
    .forEach((title, order) => useListStore.getState().addListItem({ listId: packing, title, order, status: order < 2 ? 'done' : 'want' }));
  useListStore.getState().updateListLinks(packing, { crossAppRefs: [noteRef(trip)] });   // the task's side of the link is on the task
  useTaskStore.getState().updateTask(packKit, { crossAppRefs: [noteRef(trip), { type: 'list', id: packing }] });

  const books = useListStore.getState().addList({ name: 'Reading list', kind: 'watchlist', typeId: BOOKS, icon: '📚', color: colour('green'), fieldSchema: useListStore.getState().listTypes[BOOKS]?.defaultFields });
  ([
    ['The Rock Cycle: Earth’s great recycling machine', 'J. Zalasiewicz', 'in-progress'],
    ['Under a White Sky', 'Elizabeth Kolbert', 'want'],
    ['The Ends of the World', 'Peter Brannen', 'done'],
  ] as const).forEach(([title, author, status], order) =>
    useListStore.getState().addListItem({ listId: books, title, order, status, data: { 'lf-author': author, 'lf-genre': 'Earth science', ...(status === 'done' ? { 'lf-rating': 5 } : {}) } }));

  const dictType = useListStore.getState().listTypes[DICTIONARY_TYPE_ID];
  const dictionary: ListId = useListStore.getState().addList({ name: LABELS.dictionary.listName, typeId: DICTIONARY_TYPE_ID, kind: 'reference', icon: dictType?.icon ?? null, color: dictType?.color ?? null, fieldSchema: dictType?.defaultFields });
  ([
    ['isostasy', 'noun', 'The balance of the Earth’s crust floating on the denser mantle, rising where weight is removed.', 'Scandinavia is still rising by isostasy since the ice sheets melted.'],
    ['anthropogenic', 'adjective', 'Caused or produced by humans.', 'Most of the warming since 1950 is anthropogenic.'],
    ['tuff', 'noun', 'Rock made of volcanic ash compacted together.', 'The cliff above the beach is a layer of pale tuff.'],
    ['conchoidal', 'adjective', 'Breaking with smooth, curved surfaces, like the inside of a shell.', 'Obsidian and quartz have a conchoidal fracture.'],
  ] as const).forEach(([word, pos, meaning, example], order) => useListStore.getState().addListItem({
    listId: dictionary, title: word, order,
    data: { [DICT_FIELDS.meaning]: meaning, [DICT_FIELDS.partOfSpeech]: pos, [DICT_FIELDS.example]: example, [DICT_FIELDS.source]: 'Wiktionary', [DICT_FIELDS.added]: day(-20 + order * 4) },
  }));

  // ── Records ──
  const samples = tasks.addCollection({
    kind: 'tracker', name: 'Field samples', color: colour('orange'), collectionId: fieldReport, purposeIds: [honours],
    fieldSchema: [
      { id: 'sid', name: 'Sample ID', type: 'text', required: true },
      { id: 'rock', name: 'Rock type', type: 'select', options: ['Igneous', 'Sedimentary', 'Metamorphic'] },
      { id: 'where', name: 'Location', type: 'text' },
      { id: 'mass', name: 'Mass', type: 'number', unit: 'g' },
      { id: 'photo', name: 'Photographed', type: 'boolean' },
    ],
  });
  ([
    [-12, 'C-01', 'Sedimentary', 'Campus quarry, bench 1', 412, true, 'Fine sandstone, clear cross-bedding.'],
    [-12, 'C-02', 'Sedimentary', 'Campus quarry, bench 2', 287, true, null],
    [-12, 'C-03', 'Igneous', 'Dolerite dyke, quarry entrance', 655, false, 'Weathered rind, fresh inside.'],
    [-5, 'C-04', 'Metamorphic', 'Lab collection drawer 7', 190, true, 'Slate; borrowed for Lab 3.'],
  ] as const).forEach(([offset, sid, rock, where, mass, photo, entryNotes]) =>
    useTrackerStore.getState().addEntry({ trackerId: samples, date: day(offset), data: { sid, rock, where, mass, photo }, notes: entryNotes }));

  const study = tasks.addCollection({
    kind: 'tracker', name: 'Study hours', color: colour('indigo'), purposeIds: [honours],
    fieldSchema: [
      { id: 'unit', name: 'Unit', type: 'select', options: ['GEOS201', 'GEOS215'] },
      { id: 'time', name: 'Time', type: 'duration' },
      { id: 'focus', name: 'Focus', type: 'rating', max: 5 },
    ],
  });
  [[-13, 'GEOS201', 2.5, 4], [-12, 'GEOS215', 1.5, 3], [-10, 'GEOS201', 3, 5], [-9, 'GEOS215', 2, 4], [-7, 'GEOS215', 1, 2],
    [-6, 'GEOS201', 2, 4], [-5, 'GEOS201', 3.5, 5], [-3, 'GEOS215', 2.5, 4], [-2, 'GEOS215', 3, 4], [-1, 'GEOS201', 1.5, 3]]
    .forEach(([offset, unit, hours, focus]) => useTrackerStore.getState().addEntry({ trackerId: study, date: day(offset as number), data: { unit, time: Math.round((hours as number) * 3600), focus } }));

  const routine = tasks.addCollection({
    kind: 'routine', name: 'Morning revision', color: colour('yellow'), purposeIds: [honours],
    routineTasks: [{ id: 'rt-review', title: 'Do today’s Review in Notes', order: 0 }, { id: 'rt-abstract', title: 'Read one paper abstract', order: 1 }, { id: 'rt-plan', title: 'Plan the day’s tasks', order: 2 }],
    repeatConfig: { freq: 'weekly', interval: 1, endKind: 'forever', count: null, until: null, daysOfWeek: [1, 2, 3, 4, 5] },
  });
  for (const offset of [-6, -5, -4, -2, -1]) {
    const date = day(offset);
    useRoutineStore.getState().getOrCreateInstance(routine, date);
    for (const rt of ['rt-review', 'rt-abstract', 'rt-plan']) useRoutineStore.getState().toggleRoutineTask(routine, date, rt);
    const done = useTrackerStore.getState().addEntry({ trackerId: routine, date, data: {}, notes: null });
    useRoutineStore.getState().completeRoutine(routine, date, done.id);
  }

  // ── Goals (docs/features/endeavours.md phase 5): one of each measure.
  const goal = useGoalStore.getState();
  const distinction = goal.addGoal({ title: 'Average a distinction this semester', target: { type: 'endeavour', id: semester }, by: day(42), measure: { kind: 'manual', unit: '%', target: 75, direction: 'atLeast' } });
  goal.addCheckIn(distinction, { date: day(-30), value: 78, note: 'Lab 1 and the first quiz' });
  goal.addCheckIn(distinction, { date: day(-9), value: 71, note: 'Mineral ID practical pulled it down' });
  goal.addGoal({ title: 'Keep up with the GEOS215 readings', target: { type: 'endeavour', id: semester }, by: null, measure: { kind: 'consistency', rhythmId: weekly, streamId: readingStream, count: 5, outOf: 6 } });
  goal.addGoal({ title: '10 hours of study a week', target: { type: 'endeavour', id: semester }, by: null, measure: { kind: 'tracker', trackerId: study, fieldId: 'time', target: 10 * 3600, direction: 'atLeast', aggregate: 'sum', period: 'week' } });
  goal.addGoal({ title: 'Get every essay task done', target: { type: 'endeavour', id: essay }, by: day(25), measure: { kind: 'completion', milestonesOnly: false } });

  // ── Fitness ──
  const fit = useFitnessStore.getState();
  fit.addActivity({ type: 'hike' as ActivityTypeId, title: 'Grand Canyon Track, Blue Mountains', startedAt: at(-6, '08:30'), distanceMeters: 6300, movingTimeSeconds: 3 * 3600 + 10 * 60, elapsedTimeSeconds: 4 * 3600, purposeIds: [outdoors], notes: 'Cross-bedded sandstone everywhere. Took photos for the rock cycle note.' });
  fit.addActivity({ type: 'run' as ActivityTypeId, title: 'Easy run round the park', startedAt: at(-3, '07:00'), distanceMeters: 5200, movingTimeSeconds: 29 * 60, elapsedTimeSeconds: 31 * 60, purposeIds: [outdoors] });
  fit.addActivity({ type: 'walk' as ActivityTypeId, title: 'Walk to campus', startedAt: at(-1, '08:15'), distanceMeters: 2400, movingTimeSeconds: 28 * 60, elapsedTimeSeconds: 30 * 60 });

  // ── Portfolio ──
  usePortfolioStore.getState().addWatchlistItem({ ticker: 'ICLN', name: 'iShares Global Clean Energy ETF', assetClass: 'etf', exchange: 'NASDAQ', status: 'watching', notes: 'Started looking after the climate essay reading. Small amount from my summer job, one day.', links: ['https://www.ishares.com'] });

  // ── Overviews ──
  const co2Converter = useConverterStore.getState().addConverter({ name: 'CO₂ to carbon', icon: '🌍', inputs: [{ key: 'co2', label: 'CO₂', unit: 'kg' }], output: { key: 'c', label: 'Carbon', unit: 'kg' }, formula: 'co2 * 12/44', inverse: 'c * 44/12' });
  useOverviewStore.getState().addOverview({ name: 'Due in the next fortnight', icon: '📆', sources: ['task', 'deadline', 'event', 'reminder'], collectionId: null, status: 'open', when: 'upcoming', windowDays: 14, search: '', sort: 'when-asc', groupBy: 'none' });
  useOverviewStore.getState().addOverview({ name: 'Open questions and ideas', icon: '❓', sources: ['question', 'inboxItem'], collectionId: null, status: 'open', when: 'any', windowDays: null, search: '', sort: 'source', groupBy: 'source' });

  // ── Note content ──
  const hub = { hubId: 'demo-hub-feedback', noteId: hubNote, title: 'Feedback loops in the Earth system' };
  const inboxId = 'demo-inbox-essay';
  const reviewTomorrow = day(1);

  const set = (noteId: NoteId, json: string, tabId: string | null = null) => editNoteContent(noteId, tabId, { inEditor: () => false, inJson: () => json });

  set(welcome, doc(
    section(
      h(1, 'Semester 2 at a glance'),
      p('Second year of Earth Sciences. Two units this semester: ', noteLink('Mineralogy & Petrology', rock), ' and ', noteLink('Climate Systems', carbon), '. The big things are the ', noteLink('Kiama field trip', trip), ' (and its report) and my ', noteLink('climate essay', essayNote), '.'),
    ),
    section(
      h(2, 'Coming up'),
      bullets(
        [itemLink('Book a seat on the field-trip bus', 'reminder', bookBus)],
        [itemLink('Field trip: Kiama coast', 'event', fieldTrip)],
        [itemLink('Pack the field kit', 'task', packKit)],
        [itemLink('Climate Systems mid-semester exam', 'event', midsem)],
        [itemLink('Climate essay due', 'deadline', essayDue)],
      ),
    ),
    columns(
      [h(2, 'GEOS201 Mineralogy & Petrology'), bullets(
        [noteLink('The rock cycle', rock), ', with the Lab 3 samples as a sub-note'],
        [noteLink('Identifying minerals', minerals)],
        [noteLink('Geological time', time)],
        [noteLink('Field trip: Kiama coast', trip)],
      )],
      [h(2, 'GEOS215 Climate Systems'), bullets(
        [noteLink('Week 6: carbon cycle', carbon), ' (and its Exam revision tab)'],
        [noteLink('Essay: solar geoengineering', essayNote)],
        [noteLink('Feedback loops', hubNote), ': the idea hub tying both units together'],
      )],
    ),
    section(
      h(1, 'The one idea to remember'),
      embed(rock, 'rc-big', 'quote'),
      p('Key terms so far: ', chip(lithification), ' ', chip(albedo), ' ', chip(ipcc), ' ', chip(quartz), '. They all live in the Glossary, so a definition is written once and linked everywhere.'),
      h(1, 'Shortcuts I keep forgetting'),
      table(['Type or press', 'What it does'], [
        ['\\', 'Make something from what I type next: a reminder, event or deadline, or a block (timeline, cycle, chart, maths…)'],
        ['//alpha  //to  //sup2', 'Special characters: α → ²'],
        ['-->  CO2', 'Turn into → and CO₂ as I type (Backspace undoes it)'],
        ['[[', 'Link to another note, or one passage of it'],
        ['Ctrl+G', 'Quick Access: jump to any note, task or place'],
        ['Alt+0 … Alt+7', 'Overview, Tasks, Calendar, Records, Lists, Notes…'],
        ['Ctrl+] / Ctrl+[', 'Switch a block between its designs'],
      ]),
    ),
  ));

  set(rock, doc(section(
    h(1, 'Big picture'),
    pId('rc-big', important('Rocks are not permanent: every rock is on its way to becoming another kind of rock.', 2, 'demo-imp-rc', reviewTomorrow), ' The rock cycle is how geologists describe those changes and what drives them.'),
    EX.cycle(),
    h(1, 'The three families'),
    EX.types(),
    p('Sediment only becomes rock through ', termLink('lithification', lithification, 'definition'), ':'),
    card(lithification),
    p('Volcanic ash can skip most of the cycle: it settles and compacts straight into tuff.'),
    h(1, 'Why it matters for climate'),
    pId('rc-weathering', hubPassage('Chemical weathering of silicate rocks draws CO₂ out of the atmosphere, locking it into carbonate rock over millions of years.', hub, 'demo-hl-weathering'), ' This is the planet’s slow thermostat, and it links this unit to Climate Systems.'),
    EX.quoteBlock(),
    h(1, 'Things to check'),
    p(unsure('I think slate forms at lower temperatures than schist.', 'demo-flag-slate', 'Check the metamorphic grade chart in Lecture 7'), ' Ask in the lab if the chart isn’t clear.'),
    EX.questionAnswered(at(-4, '15:20')),
    p('Lab write-up for this topic: ', noteLink('Lab 3: hand samples', lab), '.'),
  )));

  set(lab, doc(section(
    p('Worksheet due ', itemLink('Lab 3 worksheet due', 'deadline', labDue), '. Samples are logged in the Field samples tracker.'),
    table(['Sample', 'Texture', 'Minerals seen', 'My call'], [
      ['C-01', 'Fine grains, cross-bedded', 'Quartz, a little feldspar', 'Sandstone'],
      ['C-03', 'Interlocking crystals, medium', 'Plagioclase, pyroxene', 'Dolerite'],
      ['C-04', 'Splits into thin sheets', 'Too fine to see', 'Slate'],
    ]),
    p('Hardness test: C-01 scratched glass, so mostly quartz (see ', noteLink('Identifying minerals', minerals, 'min-key'), ').'),
  )));

  set(minerals, doc(section(
    p('Hand-sample identification first, then the lab confirms with ', chip(xrd), ' when it matters.'),
    EX.idKey(),
    h(1, 'The two I mix up'),
    EX.compareBlock(),
    card(quartz),
    pId('min-tip', bold('Field tip: '), 'always test hardness on a fresh surface. A weathered rind is softer than the mineral underneath, and it will fool the key.'),
    h(1, 'Hardness and density'),
    table(['Mohs', 'Mineral', 'Everyday test'], [
      ['1', 'Talc', 'Fingernail scratches it easily'], ['3', 'Calcite', 'Copper coin scratches it'],
      ['5', 'Apatite', 'Knife scratches it'], ['7', 'Quartz', 'Scratches glass'], ['10', 'Diamond', 'Scratches everything'],
    ]),
    p('Specific gravity from weighing a sample in air and in water:'),
    mathBlock('SG = \\frac{m_{\\text{air}}}{m_{\\text{air}} - m_{\\text{water}}}', 'numbered'),
    p('Quartz comes out at about 2.65; anything above ', mathInline('4'), ' is probably a metal ore.'),
  )));

  set(time, doc(section(
    p('Deep time is the hardest thing to picture. The units nest inside each other (before the Phanerozoic come the Proterozoic, Archean and Hadean eons, nearly 90% of Earth’s history):'),
    EX.hierarchy(),
    h(1, 'How we date rocks'),
    EX.breakdown(),
    p('Radioactive decay is exponential, so a half-life is constant:'),
    mathBlock('N(t) = N_0 \\, e^{-\\lambda t} \\qquad t_{1/2} = \\frac{\\ln 2}{\\lambda}'),
    p('For carbon-14, ', mathInline('t_{1/2} \\approx 5730'), ' years, which is why it is useless for rocks millions of years old.'),
    EX.conclusion(),
    p('Hutton saw this first, at Siccar Point: see ', noteLink('his line in the rock cycle note', rock), '.'),
  )));

  set(trip, doc(section(
    p('Bus leaves the Earth Sciences car park at 7:00 for ', itemLink('Field trip: Kiama coast', 'event', fieldTrip, 'expanded'), '. Before then:'),
    bullets(
      [itemLink('Book a seat on the field-trip bus', 'reminder', bookBus)],
      [itemLink('Pack the field kit', 'task', packKit), ' using the ', itemLink('Field trip packing list', 'list', packing)],
    ),
    h(1, 'The day'),
    EX.timeline(),
    ...(pictures.kiama ? [node('image', { pictureId: pictures.kiama, src: null, alt: 'The Kiama coast' })] : []),
    h(1, 'What to look for'),
    p('The whole coast is ', chip(latite), ', a Permian volcanic rock.'),
    bullets(
      [important('Columnar jointing: the hexagonal columns form as a thick lava flow cools and shrinks.', 1, 'demo-imp-columns')],
      ['Vesicles (gas bubbles) near the top of each flow'],
      ['Where the sea has eroded along joints, and how that makes the blowhole'],
      ['Any sandstone between flows, and whether it shows ', termLink('lithification', lithification, 'definition'), ' or is still loose'],
    ),
    p('From my minerals notes (the key is there too: ', noteLink('identification key', minerals, 'min-key'), '):'),
    embed(minerals, 'min-tip', 'card'),
    h(1, 'The report'),
    p('Methods by ', itemLink('Write the methods section', 'task', methods), ', submitted with ', itemLink('Submit the field trip report', 'task', submitReport), '.'),
  )));

  // A second tab, to show tabs.
  const revisionTab = useNoteStore.getState().addNoteTab(carbon, 'Exam revision');
  set(carbon, doc(section(
    p('Mid-semester exam: ', itemLink('Climate Systems mid-semester exam', 'event', midsem), '.'),
    numbered(['Energy budget numbers (340 / 100 / 240)'], ['Stefan–Boltzmann and why ', bold('T'), ' is to the fourth power'], ['Two positive feedbacks and one negative'], ['The Keeling curve: why it ', italic('wiggles'), ' every year']),
    p('Formula sheet: CO', sub('2'), ', CH', sub('4'), ', T', sup('4'), '.'),
  )), revisionTab);
  useNoteStore.getState().renameMainTab(carbon, 'Lecture notes');
  useNoteStore.getState().reorderNoteTabs(carbon, [revisionTab, MAIN_TAB_ID]);   // a note opens on its last tab

  set(carbon, doc(section(
    pId('cc-rise', important('CO₂ has risen about 50% since pre-industrial times, from 280 ppm to over 420 ppm.', 3, 'demo-imp-co2', reviewTomorrow), ' ', tagged('Almost certainly in the exam.', examTag, colour('red'))),
    EX.chart(),
    h(1, 'How we found out'),
    kids('timeline', { variant: 'rail', order: 'asc' }, ([
      ['1824', 'Joseph Fourier suggests the atmosphere keeps the Earth warmer than it would otherwise be.'],
      ['1856', 'Eunice Foote shows that CO₂ traps heat from sunlight.'],
      ['1896', 'Svante Arrhenius estimates how much doubling CO₂ would warm the planet.'],
      ['1958', 'Charles Keeling starts measuring CO₂ at Mauna Loa.'],
      ['1988', 'The IPCC is set up.'],
      ['2015', 'The Paris Agreement sets a goal of well below 2 °C.'],
    ]).map(([when, what]) => kids('timelineItem', null, [node('timelineWhen', null, when), p(what)]))),
    card(ipcc, 'compact'),
    h(1, 'Earth’s energy budget'),
    kids('breakdown', { variant: 'hub', colours: 'spectrum' }, [
      node('breakdownWhole', null, 'Incoming sunlight (340 W/m²)'),
      ...([
        ['Reflected (100)', 'By clouds, air and bright surfaces: the planet’s albedo.'],
        ['Absorbed by air (75)', 'Mostly by water vapour, dust and ozone.'],
        ['Absorbed by the surface (165)', 'Warms land and ocean, then radiates back as infrared.'],
      ]).map(([label, text]) => kids('breakdownPart', null, [node('breakdownLabel', null, label), node('breakdownText', null, text)])),
    ]),
    card(albedo),
    p('A warm body radiates in proportion to the fourth power of its temperature, with ', mathInline('\\sigma \\approx 5.67 \\times 10^{-8}\\,\\text{W m}^{-2}\\text{K}^{-4}'), ':'),
    mathBlock('j^{*} = \\varepsilon \\sigma T^{4}'),
    h(1, 'Feedbacks'),
    pId('cc-ice', hubPassage('As sea ice melts, darker ocean is exposed, the albedo falls and more sunlight is absorbed, which melts more ice.', hub, 'demo-hl-ice'), ' This is the textbook positive feedback.'),
    EX.diagram(),
    card(feedback),
    p('Anthropogenic CO₂ is a forcing, not a feedback. ', node('movedStub', { noteId: essayNote, inboxId, itemId: 'demo-ib-sinks', title: 'Essay ideas' })),
    p('Burning a tonne of coal releases about 2.4 t of CO₂. How much carbon is that?'),
    node('convertBlock', { variant: 'card', converter: co2Converter, values: { co2: '2400' } }),
    h(1, 'Why it’s warming'),
    EX.causeEffect(),
    h(1, 'Weather or climate?'),
    EX.vennBlock(),
    h(1, 'A case that worked'),
    EX.caseStudy(),
    h(1, 'Working with the data'),
    p('The tutorial’s script for the annual means (data from ', weblink('NOAA GML', 'https://gml.noaa.gov/ccgg/trends/data.html'), '):'),
    EX.codeBlock(),
    node('questionBlock', { qid: 'demo-q-ocean', status: 'open', variant: 'card' },
      node('questionText', null, 'How quickly does the ocean take up the extra CO₂, and does it slow down as the water warms?'),
      node('questionField', { field: 'why' }, 'It decides how much of each year’s emissions stays in the air.')),
  )));

  set(essayNote, doc(section(
    p('Due ', itemLink('Climate essay due', 'deadline', essayDue), '. Draft first (', itemLink('Write the first draft', 'task', draft), '), then take it to ', itemLink('Consult with my tutor about the essay', 'event', consult), '.'),
    p('Background: ', noteLink('the CO₂ numbers from Week 6', carbon, 'cc-rise'), ', and why ', termLink('albedo', albedo, 'definition'), ' is the lever geoengineering pulls.'),
    h(1, 'The argument'),
    EX.argument(),
    EX.prosCons(),
    h(1, 'The alternatives'),
    EX.options(),
    h(1, 'Evidence I’ll lean on'),
    EX.pyramid(),
    p(unsure('I think the 2 °C target was first agreed at Copenhagen, not Paris.', 'demo-flag-2c', 'Check before quoting it'), ' Either way, Paris added the 1.5 °C aim.'),
    kids('inbox', { inboxId, variant: 'board', order: 'newest' }, [
      node('inboxTitle', null, 'Essay ideas'),
      kids('inboxItem', { itemId: 'demo-ib-sinks', status: 'discussing', sentAt: at(-2, '11:05'), fromNote: carbon, fromTab: null, taskId: null }, [p('Compare geoengineering with natural carbon sinks: oceans, forests and silicate weathering.')]),
      kids('inboxItem', { itemId: 'demo-ib-pinatubo', status: 'built', sentAt: at(-5, '20:40'), fromNote: null, fromTab: null, taskId: outline }, [p('Open with Pinatubo: one eruption cooled the whole planet for two years.')]),
      kids('inboxItem', { itemId: 'demo-ib-ethics', status: 'parked', sentAt: at(-4, '09:15'), fromNote: null, fromTab: null, taskId: null }, [p('Who gets to set the global thermostat? An ethics section, if there are words to spare.')]),
      kids('inboxItem', { itemId: 'demo-ib-cost', status: 'idea', sentAt: at(-1, '18:30'), fromNote: null, fromTab: null, taskId: null }, [p('Find a cost estimate per tonne for direct air capture.')]),
    ]),
  )));

  set(hubNote, doc(section(
    p('Both units keep coming back to the same idea: the Earth system responds to a change in ways that either amplify it or damp it. Collecting every example here, for the essay and the exam.'),
    kids('hub', { hubId: hub.hubId, variant: 'list' }, [
      node('hubTitle', null, 'Feedback loops'),
      node('hubTake', null, 'Fast feedbacks (ice, water vapour) amplify warming within decades; the slow one (weathering) pulls it back over millions of years. That gap is the whole problem.'),
      node('hubLink', { linkId: 'demo-hl-ice', relation: 'exampleOf', kind: 'passage', noteId: carbon, tabId: null, entryId: null, label: 'As sea ice melts, darker ocean is exposed, the albedo falls and more sunlight is absorbed, which melts more ice.' }),
      node('hubLink', { linkId: 'demo-hl-weathering', relation: 'exampleOf', kind: 'passage', noteId: rock, tabId: null, entryId: null, label: 'Chemical weathering of silicate rocks draws CO₂ out of the atmosphere, locking it into carbonate rock over millions of years.' }),
      node('hubLink', { linkId: 'demo-hl-concept', relation: 'related', kind: 'glossary', noteId: null, tabId: null, entryId: feedback, label: 'Climate feedback' }),
      node('hubLink', { linkId: 'demo-hl-essay', relation: 'leadsTo', kind: 'note', noteId: essayNote, tabId: null, entryId: null, label: 'Essay: is solar geoengineering responsible?' }),
    ]),
    p('Every ', termLink('climate feedback', feedback, 'concept'), ' here should get a sentence in the essay’s background section.'),
  )));


  // Quick Access (Q): what a student keeps one key away.
  const pins = usePinnedItemsStore.getState();
  pins.pin('note', welcome);
  pins.pin('note', essayNote);
  pins.pin('notebook', geos215);
  pins.pin('endeavour', fieldReport);
  pins.pin('list', books);
  pins.pin('routine', routine);
  pins.pin('place', 'review');

  return {
    notebooks: { university: uni, geos201, geos215 },
    notes: { welcome, rock, minerals, trip, carbon, essay: essayNote, hub: hubNote },
    tasks: { packKit, draft },
  };
}

// The persisted keys a demo backup carries: the account's data. Per-device settings, the session
// and the assistant's logs are left out, so restoring the demo doesn't change how the app is set up.
export const DEMO_BACKUP_KEYS = [
  'todo-app-storage', 'todo-calendar', 'todo-schedules', 'todo-tracker', 'todo-routines', 'notes-storage',
  'lists-storage', 'fitness-storage', 'todo-portfolio', 'overviews-storage', 'trash-storage', 'pictures-storage',
  'item-types-storage', 'goals-storage',
] as const;
