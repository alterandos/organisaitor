import { useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useNoteStore } from '@/store/noteStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { IconField } from '@/components/IconPicker/IconField';
import { ItemIcon } from '@/components/IconPicker/ItemIcon';
import { TagField } from '@/components/TagField/TagField';
import { EndeavourLinksField } from '@/components/EndeavourLinksField/EndeavourLinksField';
import { EncryptContentsField } from '@/components/EncryptContentsField/EncryptContentsField';
import { PeriodsField } from '@/components/PeriodsField/PeriodsField';
import { CloseIcon, NotebookIcon } from '@/components/Icons';
import { FieldError } from '@/components/FieldError/FieldError';
import { showToast } from '@/components/Toast/showToast';
import { applyTemplate, discardEndeavour, parentNotebook } from '@/services/endeavourTemplates';
import { archiveEndeavourAsked } from '@/services/endeavourArchive';
import { askToMoveNotebooks } from '@/services/endeavourNotebooks';
import { commitTags, isDraftTag, tagByName } from '@/services/tags';
import { tagInUse } from '@/services/inUse';
import { deleteForever, trashedBy } from '@/services/trash';
import { blankPlan, type TemplatePlan } from '@/config/endeavourTemplates';
import { codeFromName, planFromTemplate } from '@/utils/templatePlan';
import { useTemplates } from '@/services/templates';
import { iconText } from '@/components/IconPicker/iconValue';
import { inheritedEndeavourTags, tagsFromParents } from '@/utils/tagScope';
import { parentsOf } from '@/utils/endeavourGraph';
import { endeavourColorFrom, endeavourIconFrom, lookFromParents } from '@/utils/endeavourLook';
import { detailsFromParents } from '@/utils/endeavourAttributes';
import { rangeOf } from '@/utils/datePeriods';
import { dateUseOf, periodFromUse, periodsFor, periodsFromParents } from '@/utils/datePeriods';
import { formatFieldValue } from '@/utils/itemTypes';
import { byNotebookOrder, takesNotes } from '@/utils/notes';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import type { Collection, CollectionId, DateUse, FieldSchema, PurposeId, TagId } from '@/types';
import type { NoteTag } from '@/types/notes';
import type { EndeavourTemplateDef } from '@/types/templates';
import { DetailsSection, type DetailsValue } from './DetailsSection';
import { planErrors } from './planErrors';
import styles from './EndeavourCreator.module.css';

// THE form for an Endeavour itself (docs/features/endeavours.md "Creating an Endeavour", agreed
// with the user 2026-11-04, and 2026-11-06: nothing bulky made silently), for making one and for
// editing it: what to start from (a template only fills in the form), its name, description,
// whether it ends, its dates, details, tags, colour, icon, connections, and whether to make a
// notebook. What it takes from what it's part of (tags, details, dates, colour, icon) shows greyed,
// "from Semester 1", and its own replaces it. Create makes it (and its notebook, if ticked) and opens
// its home, where what's in it is added (EndeavourPieces); the toast's Undo takes it away again.
// Editing (`editing`) saves on Save; its dates and details are its attributes there (the
// attributes pane), its links and encryption apply at once.

const L = LABELS.endeavourCreator;
const DEFAULT_INSIDE = '__default__';

interface Props {
  editing?:  Collection;
  partOf?:   CollectionId | null;
  template?: string | null;   // start from this template (a home's parts tile: a semester's Subject)
  name?:     string;          // and this name
}

export function EndeavourCreator({ editing, partOf: startPartOf = null, template: startTemplate = null, name: startName = '' }: Props) {
  const closeCreator = useUIStore((s) => s.closeCreator);
  const closeEdit = useUIStore((s) => s.closeEditCollection);
  const close = editing ? closeEdit : closeCreator;
  const live = useTaskStore((s) => (editing ? s.collections[editing.id] : undefined));
  const collections = useTaskStore((s) => s.collections);
  const purposes = useTaskStore((s) => s.purposes);
  const noteTags = useNoteStore((s) => s.noteTags);
  const types = useItemTypeStore((s) => s.types);

  const templates = useTemplates();
  // What a template fills in, for the one it starts from (lazy initial state, so nothing is copied
  // in an effect; CLAUDE.md "Form state that starts from an item").
  const [initial] = useState(() => (editing ? null : startFill(startTemplate ? templates.find((t) => t.id === startTemplate || t.builtIn === startTemplate) ?? null : null)));
  const [startFrom, setStartFrom] = useState<string | null>(() => initial?.id ?? null);
  const [name, setName] = useState(() => editing?.name ?? startName);
  const [description, setDescription] = useState(() => editing?.description ?? '');
  const [color, setColor] = useState<string | null>(() => editing?.color ?? null);
  const [icon, setIcon] = useState<string | null>(() => editing?.icon ?? null);
  const [tagIds, setTagIds] = useState<string[]>(() => editing?.tagIds ?? initial?.tagIds ?? []);
  // Editing, the form holds its own dates and details too (the user, 2026-11-07: anything set when
  // it's made can be changed here), saved on Save.
  // Which named periods it runs and pauses during (null: as what it's part of). Its periods are
  // among its details (`details`), as date ranges.
  const [use, setUse] = useState<DateUse | null>(() => (editing ? editing.dateUse ?? null : initial?.use ?? null));
  const [details, setDetails] = useState<DetailsValue>(() => (editing ? ownDetails(editing) : initial?.details ?? {}));
  const [makeNotebook, setMakeNotebook] = useState(() => initial?.notebook ?? false);
  const [inside, setInside] = useState<string>(DEFAULT_INSIDE);
  const [purposeIds, setPurposeIds] = useState<PurposeId[]>(() => editing?.purposeIds ?? []);
  // Made from an Endeavour's home (or "From a template" there), it starts as part of that Endeavour.
  const [partOf, setPartOf] = useState<CollectionId[]>(() => {
    const ui = useUIStore.getState();
    const from = startPartOf ?? (ui.activeView === 'endeavours' ? ui.endeavourHomeId : null);
    return from ? [from as CollectionId] : [];
  });
  const [related, setRelated] = useState<CollectionId[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const errors = planErrors(name, details.fields ?? [], null, details.values);
  const shownErrors = showErrors ? errors : {};
  const template = startFrom ? templates.find((t) => t.id === startFrom) ?? null : null;

  useEscapeClose(close);
  useCtrlEnterSubmit(() => submit());

  // What it takes from what it's part of.
  const nameOf = (id: string | null) => (id ? collections[id as CollectionId]?.name ?? '' : '');
  const parents: string[] = live ? parentsOf(live, collections) : partOf;
  const inheritedTags = live ? inheritedEndeavourTags(live.id, collections) : tagsFromParents(partOf, collections);
  const look = live
    ? { color: endeavourColorFrom(live.id, collections), icon: endeavourIconFrom(live.id, collections) }
    : lookFromParents(partOf, collections);
  const inheritedColor = color ? null : look.color;
  const inheritedIcon = icon ? null : look.icon;
  const inheritedDetails = detailsFromParents(parents, details.fields ?? [], collections, types);
  // Dates it takes: only once they say something (a semester made without its dates yet has none).
  const inheritedPeriods = live ? periodsFor(live.id, collections).filter((p) => p.endeavourId !== live.id) : periodsFromParents(parents, collections);
  const aboveUse = parents.map((p) => dateUseOf(p, collections)).find(Boolean) ?? null;
  const ownPeriods = (details.fields ?? []).filter((f) => f.type === 'dateRange')
    .map((f) => ({ id: f.id, name: f.name, ...rangeOf(details.values?.[f.id]), endeavourId: live?.id ?? '' }));
  const resolved = periodFromUse(use ?? aboveUse?.use ?? { runs: [], pauses: [] }, [...ownPeriods, ...inheritedPeriods]);
  // Whether it ends is its dates (the user, 2026-11-07: "if I add dates, I know it has an end"): a
  // finishable project with an end date, else ongoing. Not asked.
  const kind: 'project' | 'list' = resolved?.end ? 'project' : 'list';
  // A template's tag it takes anyway isn't shown twice (it's left off its own on Create too).
  const inheritedIds = new Set(inheritedTags.map((t) => t.id as string));
  const ownTags = tagIds.filter((t) => !inheritedIds.has(t));
  // What the template reads from the name (a subject's code), shown until a value is typed.
  const fromName = template?.codeFromName ? codeFromName(name) : null;

  // A template only fills in the form (the user, 2026-11-03 and 2026-11-06): whether it ends, its
  // details (as details of its own, values to fill in), its dates with the time off it starts with,
  // its tags, and whether a notebook is ticked.
  function chooseStart(id: string | null) {
    setStartFrom(id);
    const f = startFill(id ? templates.find((x) => x.id === id) ?? null : null);
    setDetails(f.details);
    setUse(f.use);
    setTagIds(f.tagIds);
    setMakeNotebook(f.notebook);
  }

  function ok(): boolean {
    if (!Object.keys(errors).length) return true;
    setShowErrors(true);
    if (errors.name) nameRef.current?.focus();
    return false;
  }

  function submit() {
    if (!ok()) return;
    if (editing) save(editing.id); else create();
  }

  // The template's plan, made with the real name, and what the form says about the Endeavour.
  function finalPlan(madeTagIds: TagId[]): TemplatePlan {
    const full = name.trim();
    // What the template reads from the name (a subject's code) fills in what wasn't typed.
    const typed = Object.fromEntries(Object.entries(details.values ?? {}).filter(([, v]) => v !== null && v !== ''));
    const base = template ? planFromTemplate(template, { name: full, notebook: false }) : blankPlan(full);
    return {
      ...base,
      endeavour: {
        ...base.endeavour, name: full, kind, deadline: null, description: description.trim() || null, color, icon, purposeIds, related,
        fields: details.fields ?? [], values: { ...(base.endeavour.values ?? {}), ...typed }, ...(use ? { dateUse: use } : {}),
        tagIds: madeTagIds, tagNames: [],
      },
      notebooks: makeNotebook ? [{ name: full, ...(inside === DEFAULT_INSIDE ? {} : { inside: inside || null }) }] : [],
    };
  }

  function create() {
    const newTags = tagIds.filter(isDraftTag);
    const madeTagIds = commitTags(tagIds);
    const { id } = applyTemplate(finalPlan(madeTagIds), partOf);
    const ui = useUIStore.getState();
    closeCreator();
    ui.setActiveView('endeavours');
    ui.openEndeavourHome(id);
    showToast({ message: L.made(name.trim()), actions: [{ label: L.undo, onClick: () => {
      // Everything made since, from its home too, goes with it (for good), and the tags it made.
      discardEndeavour(id, new Set(Object.keys(useItemTypeStore.getState().types)));
      for (const t of newTags) {
        if (!tagInUse(t as TagId)) for (const entry of trashedBy(() => useTaskStore.getState().deleteTag(t as TagId))) deleteForever(entry);
      }
      if (useUIStore.getState().endeavourHomeId === id) useUIStore.getState().openEndeavourHome(null);
    } }] });
  }

  function save(id: CollectionId) {
    const c = useTaskStore.getState().collections[id];
    const fields = details.fields ?? [];
    const keep = new Set(fields.map((f) => f.id));
    // Its own details as the form holds them; a period field (the attributes pane's) stays as it was.
    const periodFields = (c?.attributes?.fields ?? []).filter((f) => f.type === 'period');
    const values = Object.fromEntries(Object.entries({ ...(c?.attributes?.values ?? {}), ...(details.values ?? {}) }).filter(([k]) => keep.has(k) || periodFields.some((f) => f.id === k)));
    useTaskStore.getState().updateCollection(id, {
      name: name.trim(), description: description.trim() || null, color, icon, purposeIds, tagIds: commitTags(tagIds), kind,
      period: null, dateUse: use,
      attributes: { typeId: c?.attributes?.typeId ?? null, fields: [...periodFields, ...fields], values },
    });
    closeEdit();
  }

  function toggleArchive() {
    if (!live) return;
    closeEdit();
    void archiveEndeavourAsked(live.id, !live.archivedAt);
  }

  const purposeList = Object.values(purposes).filter((p) => !p.archivedAt || purposeIds.includes(p.id));
  const names = (ids: string[]) => ids.map((i) => collections[i as CollectionId]?.name).filter(Boolean).join(', ');
  const editLinks = live ? (k: 'partOf' | 'related') => (live.links ?? []).filter((l) => l.kind === k).map((l) => l.targetId) : null;
  const partOfIds = editLinks ? editLinks('partOf') : partOf;
  const relatedIds = editLinks ? editLinks('related') : related;
  const summary = [
    partOfIds.length ? L.partOfSummary(names(partOfIds)) : '',
    relatedIds.length ? L.relatedSummary(names(relatedIds)) : '',
    purposeIds.length ? L.servesSummary(purposeIds.map((p) => purposes[p]?.name).filter(Boolean).join(', ')) : '',
  ].filter(Boolean).join(' · ');
  const hasErrors = showErrors && Object.keys(errors).length > 0;
  const defaultInside = parentNotebook((partOf[0] ?? null) as CollectionId | null);
  const notebooks = Object.values(noteTags).filter((t) => t.kind === 'area' && takesNotes(t));

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="creator-title">
        <div className={styles.header}>
          <h2 id="creator-title" className={styles.title}>
            {editing ? L.titleEdit(editing.name) : L.titleNew}
            {live?.archivedAt && <span className={styles.badge}>{L.archived}</span>}
          </h2>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label={L.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          {!editing && (
            <div className={styles.field} role="group" aria-label={L.startFrom}>
              <span className={styles.label}>{L.startFrom}</span>
              <div className={styles.starts}>
                <StartCard on={startFrom === null} icon="✨" label={L.blank} detail={L.blankDetail} onClick={() => chooseStart(null)} />
                {templates.map((t) => (
                  <StartCard key={t.id} on={startFrom === t.id} icon={iconText(t.icon, '📁')} label={t.name} detail={t.description} onClick={() => chooseStart(t.id)} />
                ))}
              </div>
            </div>
          )}

          <div className={styles.nameLine}>
            <IconField value={icon} onChange={setIcon} fallback={inheritedIcon?.value ? iconText(inheritedIcon.value, '🎯') : '🎯'} label={L.icon} />
            <div className={styles.field}>
              <label htmlFor="creator-name" className={styles.label}>{L.name}</label>
              <input id="creator-name" ref={nameRef} className={styles.input} value={name} placeholder={L.namePlaceholder} autoFocus
                aria-invalid={!!shownErrors.name || undefined} aria-describedby={shownErrors.name ? 'creator-name-error' : undefined}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); submit(); } }} />
              <FieldError id="creator-name-error">{shownErrors.name}</FieldError>
            </div>
          </div>
          {inheritedIcon?.value && <p className={styles.small}><ItemIcon icon={inheritedIcon.value} className={styles.inlineIcon} /> {L.iconFrom(nameOf(inheritedIcon.from))}</p>}

          <label className={styles.field}>
            <span className={styles.label}>{L.description}</span>
            <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={L.descriptionPlaceholder} />
          </label>

          {(
            <>
              <div className={styles.field} role="group" aria-label={L.dates}>
                <span className={styles.label} title={LABELS.periods.hint}>{L.dates} <span className={styles.hintMark} aria-hidden>?</span></span>
                <PeriodsField
                  fields={details.fields} values={details.values}
                  onFields={(fields: FieldSchema[], values) => setDetails((d) => ({ ...d, fields, values }))}
                  inherited={inheritedPeriods} use={use} onUse={setUse}
                  above={aboveUse ? { use: aboveUse.use, name: nameOf(aboveUse.from) } : null}
                  fromName={nameOf} errors={shownErrors} />
              </div>
              {inheritedDetails.length > 0 && (
                <div className={styles.field} role="group" aria-label={L.inheritedDetails}>
                  <span className={styles.label}>{L.inheritedDetails}</span>
                  {inheritedDetails.map(({ field, value, fromId }) => (
                    <div key={field.id} className={styles.inheritedLine}>
                      <span className={styles.detailFixed}>{field.name}</span>
                      <span>{formatFieldValue(field, value)}</span>
                      <span className={styles.from}>{L.from(nameOf(fromId))}</span>
                      <button type="button" className={styles.linkBtn}
                        onClick={() => setDetails((d) => ({ ...d, fields: [...(d.fields ?? []), { ...field }], values: { ...(d.values ?? {}), [field.id]: value } }))}>
                        {L.setOwn}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <DetailsSection value={details} errors={shownErrors} fallback={fromName ? { code: fromName } : undefined} onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))} />
            </>
          )}

          <TagField value={ownTags} onChange={setTagIds} inherited={inheritedTags} fromName={nameOf} labelClassName={styles.label} />

          <div className={styles.field}>
            <span className={styles.label}>{L.colour}</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
            {inheritedColor?.value && (
              <p className={styles.small}><span className={styles.dot} style={{ background: inheritedColor.value }} aria-hidden /> {L.colourFrom(nameOf(inheritedColor.from))}</p>
            )}
          </div>

          {!editing && (
            <div className={styles.field}>
              <label className={`${styles.optionCard} ${makeNotebook ? styles.optionCardOn : ''}`}>
                <input type="checkbox" className={styles.optionCheck} aria-label={L.notebook} checked={makeNotebook} onChange={(e) => setMakeNotebook(e.target.checked)} />
                <NotebookIcon className={styles.optionIcon} aria-hidden />
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>{L.notebook}</span>
                  <span className={styles.small}>{L.notebookHint}</span>
                </span>
              </label>
              {makeNotebook && (
                <label className={styles.insideLine}>
                  <span className={styles.small}>{L.inside}</span>
                  <select className={styles.input} value={inside} onChange={(e) => setInside(e.target.value)} aria-label={L.inside}>
                    <option value={DEFAULT_INSIDE}>{defaultInside ? notebookPath(defaultInside, noteTags) : L.topLevel}</option>
                    {defaultInside && <option value="">{L.topLevel}</option>}
                    {notebooks.filter((n) => n.id !== defaultInside).sort(byNotebookOrder).map((n) => <option key={n.id} value={n.id}>{notebookPath(n.id, noteTags)}</option>)}
                  </select>
                </label>
              )}
              <p className={styles.small}>{L.afterCreate}</p>
            </div>
          )}

          <div className={styles.field} role="group" aria-label={L.connections}>
            <div className={styles.labelRow}>
              <span className={styles.label}>{L.connections}</span>
              <button type="button" className={styles.linkBtn} aria-expanded={connectionsOpen} onClick={() => setConnectionsOpen((o) => !o)}>{connectionsOpen ? L.hide : L.change}</button>
            </div>
            {!connectionsOpen && <p className={styles.small}>{summary || L.connectionsNone}</p>}
            {connectionsOpen && (
              <div className={styles.connections}>
                {live ? (
                  <>
                    <EndeavourLinksField kind="partOf" selfId={live.id} onLinked={() => void askToMoveNotebooks(live.id)} />
                    <EndeavourLinksField kind="related" selfId={live.id} />
                  </>
                ) : (
                  <>
                    <EndeavourLinksField kind="partOf" selfId={null} value={partOf} onChange={setPartOf} />
                    <EndeavourLinksField kind="related" selfId={null} value={related} onChange={setRelated} />
                  </>
                )}
                {purposeList.length > 0 && (
                  <div className={styles.field} role="group" aria-label={L.purposes}>
                    <span className={styles.label}>{L.purposes}</span>
                    <div className={styles.starts}>
                      {purposeList.map((p) => (
                        <button key={p.id} type="button" aria-pressed={purposeIds.includes(p.id)} className={`${styles.chip} ${purposeIds.includes(p.id) ? styles.chipOn : ''}`}
                          onClick={() => setPurposeIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {live && (
            <EncryptContentsField
              label={LABELS.encryptionScope.endeavourToggle(LABELS.collection)}
              hint={LABELS.encryptionScope.endeavourHint(LABELS.collection)}
              value={!!live.encryptContents}
              withFlag={(ctx) => ({ ...ctx, collections: { ...ctx.collections, [live.id]: { ...live, encryptContents: true } } })}
              onChange={(next) => useTaskStore.getState().updateCollection(live.id, { encryptContents: next })}
            />
          )}
        </div>

        <div className={styles.footer}>
          {live && <button type="button" className={styles.secondaryBtn} onClick={toggleArchive}>{live.archivedAt ? L.restore : L.archive}</button>}
          {hasErrors && <FieldError>{L.fixFirst}</FieldError>}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryBtn} onClick={close}>{L.cancel}</button>
          <button type="button" className={styles.submitBtn} onClick={submit}>{editing ? L.save : L.create}</button>
        </div>
      </div>
    </div>
  );
}

// Its own details, as the form edits them (a period field stays the attributes pane's).
function ownDetails(c: Collection): DetailsValue {
  return { fields: (c.attributes?.fields ?? []).filter((f) => f.type !== 'period').map((f) => ({ ...f })), values: { ...(c.attributes?.values ?? {}) } };
}

// A template's dates as named periods (2026-11-07): its dates one it runs during ("Teaching" for a
// semester), an exam period one of its own, each piece of time off one it pauses during.
function templatePeriods(t: EndeavourTemplateDef | null): { details: DetailsValue; use: DateUse | null } {
  const fields: FieldSchema[] = (t?.details ?? []).map((f) => ({ ...f }));
  const values: Record<string, unknown> = {};
  const use: DateUse = { runs: [], pauses: [] };
  const add = (name: string, role: 'runs' | 'pauses' | null) => {
    const id = nanoid(8);
    fields.push({ id, name, type: 'dateRange' });
    values[id] = { from: '', to: '' };
    if (role) use[role].push(id);
  };
  if (t?.dates.show) {
    add(t.id === 'semester' || t.builtIn === 'semester' ? LABELS.periods.teaching : LABELS.periods.dates, 'runs');
    if (t.dates.exams) add(LABELS.periods.exams, null);
    for (const name of t.dates.timeOff) add(name, 'pauses');
  }
  return { details: { fields, values }, use: use.runs.length || use.pauses.length ? use : null };
}

// What a template fills in on the form (none: blank).
function startFill(t: EndeavourTemplateDef | null) {
  return {
    id: t?.id ?? null,
    ...templatePeriods(t),
    tagIds: t ? t.tags.map(tagByName) : [],
    notebook: t?.notebook ?? false,
  };
}

// A notebook's place, as "University › Biology".
function notebookPath(id: string, noteTags: Record<string, NoteTag>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let t: NoteTag | undefined = noteTags[id]; t && !seen.has(t.id); t = t.parentTagId ? noteTags[t.parentTagId] : undefined) {
    seen.add(t.id);
    names.unshift(t.name);
  }
  return names.join(' › ');
}

function StartCard({ on, icon, label, detail, onClick }: { on: boolean; icon: string; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} className={`${styles.start} ${on ? styles.startOn : ''}`} onClick={onClick}>
      <span className={styles.startTitle}><span aria-hidden>{icon}</span> {label}</span>
      <span className={styles.startDetail}>{detail}</span>
    </button>
  );
}
