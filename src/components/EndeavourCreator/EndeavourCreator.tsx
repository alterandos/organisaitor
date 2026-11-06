import { useRef, useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useItemTypeStore } from '@/store/itemTypeStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { ColorPicker } from '@/components/ColorPicker/ColorPicker';
import { EndeavourLinksField } from '@/components/EndeavourLinksField/EndeavourLinksField';
import { EncryptContentsField } from '@/components/EncryptContentsField/EncryptContentsField';
import { AttributesSummary } from '@/components/EndeavourAttributes/EndeavourAttributesPane';
import { PeriodEditor } from '@/components/PeriodField/PeriodEditor';
import { CloseIcon, TrashIcon } from '@/components/Icons';
import { FieldError } from '@/components/FieldError/FieldError';
import { showToast } from '@/components/Toast/showToast';
import { applyTemplate, discardEndeavour } from '@/services/endeavourTemplates';
import { blankPlan, type TemplatePlan } from '@/config/endeavourTemplates';
import { planFromTemplate } from '@/utils/templatePlan';
import { useTemplates } from '@/services/templates';
import { iconText } from '@/components/IconPicker/iconValue';
import { nanoid } from 'nanoid';
import { LABELS } from '@/config/labels';
import { now } from '@/utils/date';
import type { Collection, CollectionId, EndeavourPeriod, PurposeId } from '@/types';
import { DetailsSection, type DetailsValue } from './DetailsSection';
import { planErrors } from './planErrors';
import styles from './EndeavourCreator.module.css';

// THE form for an Endeavour itself (docs/features/endeavours.md "Creating an Endeavour", agreed
// with the user 2026-11-04), for making one and for editing it: what to start from (a template only
// fills in defaults), its name, description, whether it ends, its dates, details, colour and
// connections. Create makes it and opens its home, where what's in it is added (EndeavourPieces);
// the toast's Undo takes it away again. Editing (`editing`) saves on Save; its dates and details
// are its attributes there (the attributes pane), its links and encryption apply at once.

const L = LABELS.endeavourCreator;
const EMPTY_PERIOD: EndeavourPeriod = { start: null, end: null, breaks: [], exams: null };

interface Props {
  editing?: Collection;
  partOf?:  CollectionId | null;
}

export function EndeavourCreator({ editing, partOf: startPartOf = null }: Props) {
  const closeCreator = useUIStore((s) => s.closeCreator);
  const closeEdit = useUIStore((s) => s.closeEditCollection);
  const close = editing ? closeEdit : closeCreator;
  const live = useTaskStore((s) => (editing ? s.collections[editing.id] : undefined));
  const collections = useTaskStore((s) => s.collections);
  const purposes = useTaskStore((s) => s.purposes);

  const [startFrom, setStartFrom] = useState<string | null>(null);
  const [name, setName] = useState(() => editing?.name ?? '');
  const [description, setDescription] = useState(() => editing?.description ?? '');
  const [color, setColor] = useState<string | null>(() => editing?.color ?? null);
  const [kind, setKind] = useState<'project' | 'list'>(() => (editing?.kind === 'list' ? 'list' : 'project'));
  const [period, setPeriod] = useState<EndeavourPeriod | null>(null);
  const [details, setDetails] = useState<DetailsValue>({});
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
  // The Types there were when it opened: discarding it (the toast's Undo) takes away any added since.
  const [typesBefore] = useState(() => new Set(Object.keys(useItemTypeStore.getState().types)));
  const nameRef = useRef<HTMLInputElement>(null);

  const errors = planErrors(name, details.fields ?? [], period);
  const shownErrors = showErrors ? errors : {};
  const templates = useTemplates();
  const template = startFrom ? templates.find((t) => t.id === startFrom) ?? null : null;

  useEscapeClose(close);
  useCtrlEnterSubmit(() => submit());

  // A template only fills in the form (the user, 2026-11-03): whether it ends, its details (as
  // details of its own, values to fill in), and its dates with the time off it starts with.
  function chooseStart(id: string | null) {
    setStartFrom(id);
    const t = id ? templates.find((x) => x.id === id) ?? null : null;
    setKind(t?.kind ?? 'project');
    setDetails({ fields: (t?.details ?? []).map((f) => ({ ...f })), values: {} });
    setPeriod(t?.dates.show ? { ...EMPTY_PERIOD, breaks: t.dates.timeOff.map((label) => ({ id: nanoid(8), label, from: '', to: '' })) } : t ? null : period);
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
  function finalPlan(): TemplatePlan {
    const full = name.trim();
    // What the template reads from the name (a subject's code) fills in what wasn't typed.
    const typed = Object.fromEntries(Object.entries(details.values ?? {}).filter(([, v]) => v !== null && v !== ''));
    const base = template ? planFromTemplate(template, { name: full, period }) : blankPlan(full);
    return {
      ...base,
      endeavour: {
        ...base.endeavour, name: full, kind, deadline: null, description: description.trim() || null, color, purposeIds, related,
        period: period ?? undefined, fields: details.fields ?? [], values: { ...(base.endeavour.values ?? {}), ...typed },
      },
    };
  }

  function create() {
    const { id } = applyTemplate(finalPlan(), partOf, typesBefore);
    const ui = useUIStore.getState();
    closeCreator();
    ui.setActiveView('endeavours');
    ui.openEndeavourHome(id);
    showToast({ message: L.made(name.trim()), actions: [{ label: L.undo, onClick: () => {
      // Everything made since, from its home too, goes with it (for good).
      discardEndeavour(id, typesBefore);
      if (useUIStore.getState().endeavourHomeId === id) useUIStore.getState().openEndeavourHome(null);
    } }] });
  }

  function save(id: CollectionId) {
    useTaskStore.getState().updateCollection(id, { name: name.trim(), description: description.trim() || null, color, purposeIds });
    closeEdit();
  }

  function toggleArchive() {
    if (!live) return;
    useTaskStore.getState().updateCollection(live.id, { archivedAt: live.archivedAt ? null : now() });
    closeEdit();
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

          <div className={styles.field}>
            <label htmlFor="creator-name" className={styles.label}>{L.name}</label>
            <input id="creator-name" ref={nameRef} className={styles.input} value={name} placeholder={L.namePlaceholder} autoFocus
              aria-invalid={!!shownErrors.name || undefined} aria-describedby={shownErrors.name ? 'creator-name-error' : undefined}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); submit(); } }} />
            <FieldError id="creator-name-error">{shownErrors.name}</FieldError>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{L.description}</span>
            <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={L.descriptionPlaceholder} />
          </label>

          {/* Whether it ends is settled once it's made */}
          {!editing && <div className={styles.field} role="group" aria-label={L.ends}>
            <span className={styles.label}>{L.ends}</span>
            <div className={styles.segmented}>
              {(['project', 'list'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} className={`${styles.segment} ${kind === k ? styles.segmentOn : ''}`} onClick={() => setKind(k)}>
                  {k === 'project' ? L.endsProject : L.endsList}
                </button>
              ))}
            </div>
            <p className={styles.small}>{L.endsHint[kind]}</p>
          </div>}

          {editing ? (
            live && <AttributesSummary id={live.id} />
          ) : (
            <>
              <div className={styles.field} role="group" aria-label={L.dates}>
                <div className={styles.labelRow}>
                  <span className={styles.label}>{L.dates}</span>
                  {period && !template?.dates.show && (
                    <button type="button" className={styles.iconBtn} aria-label={L.removeDates} title={L.removeDates} onClick={() => setPeriod(null)}><TrashIcon width="1em" height="1em" /></button>
                  )}
                </div>
                {period
                  ? <PeriodEditor period={period} exams={!!template?.dates.exams} errors={shownErrors} onChange={setPeriod} />
                  : <button type="button" className={styles.linkBtn} onClick={() => setPeriod(EMPTY_PERIOD)}>{L.addDates}</button>}
              </div>
              <DetailsSection value={details} errors={shownErrors} onChange={(patch) => setDetails((d) => ({ ...d, ...patch }))} />
            </>
          )}

          <div className={styles.field}>
            <span className={styles.label}>{L.colour}</span>
            <ColorPicker palette="standard" value={color} onChange={setColor} />
          </div>

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
                    <EndeavourLinksField kind="partOf" selfId={live.id} />
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

function StartCard({ on, icon, label, detail, onClick }: { on: boolean; icon: string; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} className={`${styles.start} ${on ? styles.startOn : ''}`} onClick={onClick}>
      <span className={styles.startTitle}><span aria-hidden>{icon}</span> {label}</span>
      <span className={styles.startDetail}>{detail}</span>
    </button>
  );
}
