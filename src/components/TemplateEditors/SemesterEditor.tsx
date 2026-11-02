import { useState } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useListViews } from '@/store/listViews';
import { useGoalStore } from '@/store/goalStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useCtrlEnterSubmit } from '@/hooks/useCtrlEnterSubmit';
import { AttributesSummary } from '@/components/EndeavourAttributes/EndeavourAttributesPane';
import { EndeavourContentsSummary } from '@/components/EndeavourContents/EndeavourContentsModal';
import { CloseIcon } from '@/components/Icons';
import { showToast } from '@/components/Toast/showToast';
import { addSubject, addToEndeavour } from '@/services/endeavourTemplates';
import { semesterSuggestions, type TemplatePlan } from '@/config/endeavourTemplates';
import { childrenOf } from '@/utils/endeavourGraph';
import { LABELS } from '@/config/labels';
import type { Collection, CollectionId } from '@/types';
import styles from './TemplateEditors.module.css';

// A semester's own editor (docs/features/endeavours.md phase 7 (d)): opened by Edit on an
// Endeavour made from the Semester template. Its name, its period with breaks and exam period
// (which its subjects take, live), its subjects with "+ Subject", and what it suggests and hasn't
// got yet (an admin list, a weekly planning rhythm, a goal for the average). Everything applies as
// it's changed; "All settings" opens the ordinary Endeavour editor.

const L = LABELS.semesterEditor;
const S = LABELS.subjectEditor;
type Suggestion = 'admin' | 'planning' | 'average';
const DEFAULT_AVERAGE = 75;

export function SemesterEditor({ id }: { id: CollectionId }) {
  const closeModal = useUIStore((s) => s.closeModal);
  const collections = useTaskStore((s) => s.collections);
  const lists = useListViews();
  const goals = useGoalStore((s) => s.goals);
  const deadlines = useCalendarStore((s) => s.deadlines);
  const c = collections[id];
  const [name, setName] = useState(() => c?.name ?? '');
  const [subject, setSubject] = useState('');
  useEscapeClose(closeModal);
  useCtrlEnterSubmit(() => closeModal());
  if (!c) return null;

  const ui = useUIStore.getState;
  const isEndeavour = (x: Collection | undefined): x is Collection => !!x && (x.kind === 'project' || x.kind === 'list') && !x.archivedAt;
  const subjects = childrenOf(id, collections).map((k) => collections[k]).filter(isEndeavour).sort((a, b) => a.name.localeCompare(b.name));
  const missing: Suggestion[] = [
    ...(Object.values(lists).some((l) => l.collectionId === id) ? [] : ['admin' as const]),
    ...(Object.values(deadlines).some((d) => d.repeat && !d.archivedAt && d.collectionId === id) ? [] : ['planning' as const]),
    ...(Object.values(goals).some((g) => g.target.id === id) ? [] : ['average' as const]),
  ];

  function saveName() {
    const next = name.trim();
    if (next && next !== c!.name) useTaskStore.getState().updateCollection(id, { name: next });
    else setName(c!.name);
  }

  function addOne() {
    if (!subject.trim()) return;
    const { undo } = addSubject(id, subject);
    setSubject('');
    showToast({ message: L.added(subject.trim()), actions: [{ label: S.undo, onClick: undo }] });
  }

  function take(s: Suggestion) {
    const by = c!.period?.exams?.to ?? c!.period?.end ?? c!.deadline;
    const parts = semesterSuggestions(c!.name, by, { admin: s === 'admin', planDay: s === 'planning' ? 0 : null, average: s === 'average' ? DEFAULT_AVERAGE : null });
    const plan: TemplatePlan = { endeavour: { name: c!.name, kind: 'project', deadline: null, templateId: 'semester' }, notebook: null, starterTypes: null, tasks: [], parts: [], ...parts };
    const { undo } = addToEndeavour(id, plan);
    showToast({ message: L.added(L[s]), actions: [{ label: S.undo, onClick: undo }] });
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="semester-editor-title">
        <div className={styles.header}>
          <h2 id="semester-editor-title" className={styles.title}>🗓 {c.name}</h2>
          <button type="button" className={styles.closeBtn} onClick={closeModal} aria-label={S.close}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.label}>{S.name}</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>

          <AttributesSummary id={id} />

          <EndeavourContentsSummary id={id} />

          <section className={styles.section} aria-label={L.subjects}>
            <div className={styles.sectionHead}>
              <h3 className={styles.label}>{L.subjects}</h3>
              <span className={styles.hint}>{L.subjectsHint}</span>
            </div>
            {subjects.length === 0 && <p className={styles.empty}>{L.noSubjects}</p>}
            <ul className={styles.items}>
              {subjects.map((x) => (
                <li key={x.id}>
                  <button type="button" className={styles.item} onClick={() => ui().openEditCollection(x)}>
                    <span className={styles.itemIcon} aria-hidden>🎓</span>
                    <span className={styles.itemTitle}>{x.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form className={styles.inlineAdd} onSubmit={(e) => { e.preventDefault(); addOne(); }}>
              <input className={styles.input} aria-label={L.subjectName} placeholder={L.subjectPlaceholder} value={subject} onChange={(e) => setSubject(e.target.value)} />
              <button type="submit" className={styles.addBtn} disabled={!subject.trim()}>{L.addSubject}</button>
            </form>
          </section>

          {missing.length > 0 && (
            <section className={styles.section} aria-label={L.suggested}>
              <h3 className={styles.label}>{L.suggested}</h3>
              <ul className={styles.items}>
                {missing.map((s) => (
                  <li key={s} className={styles.inlineAdd}>
                    <span className={styles.itemTitle}>{L[s]}</span>
                    <button type="button" className={styles.addBtn} onClick={() => take(s)}>{L.addSuggestion}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className={`${styles.actions} ${styles.footer}`}>
          <button type="button" className={styles.secondaryBtn} onClick={() => ui().openEndeavourSettings(c)}>{S.allSettings}</button>
          <span className={styles.spacer} />
          <button type="button" className={styles.submitBtn} onClick={closeModal}>{S.done}</button>
        </div>
      </div>
    </div>
  );
}
