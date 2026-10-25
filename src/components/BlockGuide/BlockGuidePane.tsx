import { useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useUIStore } from '@/store/uiStore';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { BlockGuideIcon, CloseIcon } from '@/components/Icons';
import { noteEditorExtensions } from '@/components/NoteEditor/noteEditorExtensions';
import { BLOCK_CATEGORIES, categoryLabel } from '@/components/NoteEditor/objects/blockCategories';
import noteStyles from '@/components/NoteEditor/NoteEditor.module.css';
import { LABELS } from '@/config/labels';
import { BLOCK_GUIDE_NEEDS, GUIDE_BLOCKS, exampleDoc, guideMatches, type GuideBlock } from './guideData';
import styles from './BlockGuide.module.css';

const L = LABELS.blockGuide;

// The block guide (a Place; also from the `\` menu): every block a note can hold, by category,
// with what it's for, its keyword, its designs, and an example drawn by the note editor itself in
// the design picked (the demo account's examples, blockGuide.ts). Search by name, keyword or use.
// No single primary action, so no Ctrl+Enter.
export default function BlockGuide() {
  const close = useUIStore((s) => s.closeBlockGuide);
  const start = useUIStore((s) => s.blockGuideStart);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(() => start ?? GUIDE_BLOCKS[0].kind.id);
  const [designs, setDesigns] = useState<Record<string, string>>({});
  useEscapeClose(close);

  const shown = GUIDE_BLOCKS.filter((b) => guideMatches(b, query));
  const current = GUIDE_BLOCKS.find((b) => b.kind.id === selected) ?? shown[0] ?? GUIDE_BLOCKS[0];
  const design = designs[current.kind.id] ?? current.designs[0]?.id ?? null;

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.pane} role="dialog" aria-label={L.title}>
        <div className={styles.header}>
          <span className={styles.title}><BlockGuideIcon aria-hidden="true" /> {L.title}</span>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label={L.close}><CloseIcon /></button>
        </div>
        <div className={styles.body}>
          <nav className={styles.side} aria-label={L.title}>
            <input
              className={styles.search} value={query} placeholder={L.search} aria-label={L.search} autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) setSelected(shown[0].kind.id); }}
            />
            <div className={styles.lists}>
              {BLOCK_CATEGORIES.map((c) => {
                const inCat = shown.filter((b) => b.kind.category === c.id);
                if (!inCat.length) return null;
                return (
                  <section key={c.id}>
                    <h4 className={styles.group}>{categoryLabel(c.id)}</h4>
                    <ul className={styles.list}>
                      {inCat.map((b) => (
                        <li key={b.kind.id}>
                          <button type="button" className={`${styles.item} ${current.kind.id === b.kind.id ? styles.itemOn : ''}`} onClick={() => setSelected(b.kind.id)} aria-current={current.kind.id === b.kind.id}>
                            <span className={styles.itemIcon} aria-hidden="true">{b.kind.icon}</span>
                            {b.kind.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {!shown.length && <p className={styles.hint}>{L.noMatch}</p>}
            </div>
          </nav>
          <section className={styles.main} aria-live="polite">
            <BlockPage block={current} design={design} onDesign={(d) => setDesigns((m) => ({ ...m, [current.kind.id]: d }))} />
          </section>
        </div>
      </div>
    </div>
  );
}

function BlockPage({ block, design, onDesign }: { block: GuideBlock; design: string | null; onDesign: (d: string) => void }) {
  const k = block.kind;
  const needs = BLOCK_GUIDE_NEEDS[block.node];
  return (
    <div className={styles.page}>
      <h3 className={styles.pageTitle}><span aria-hidden="true">{k.icon}</span> {k.label}</h3>
      <p className={styles.hintLine}>{k.hint}</p>
      <p className={styles.keywords}>
        <span className={styles.label}>{L.keyword}</span> <code className={styles.kw}>\{k.id}</code>
        {k.aliases.length > 0 && <> <span className={styles.label}>{L.also}</span> {k.aliases.map((a) => <code key={a} className={styles.alias}>\{a}</code>)}</>}
      </p>
      {block.designs.length > 0 && (
        <div className={styles.designs} role="tablist" aria-label={L.designs}>
          <span className={styles.label}>{L.designs}</span>
          {block.designs.map((d) => (
            <button key={d.id} type="button" role="tab" aria-selected={design === d.id} className={`${styles.design} ${design === d.id ? styles.designOn : ''}`} onClick={() => onDesign(d.id)} disabled={!!needs}>
              {/* A design's icon is a constant drawing from its block's own list (blockDesigns.ts). */}
              <span className={styles.designIcon} aria-hidden="true" ref={(el) => { if (el && el.innerHTML !== d.icon) el.innerHTML = d.icon; }} />
              {d.label}
            </button>
          ))}
        </div>
      )}
      {needs ? <p className={styles.needs}>{L.needs[needs]}</p> : <Example key={`${block.node}-${design}`} node={block.node} design={design} />}
      <p className={styles.tip}>{L.tip(k.id)}</p>
    </div>
  );
}

// The example, drawn by the note editor (read-only) from the very list of extensions a note uses.
function Example({ node, design }: { node: string; design: string | null }) {
  const extensions = useMemo(() => noteEditorExtensions({ noteEncrypted: () => null, linkClass: noteStyles.link }), []);
  const doc = useMemo(() => exampleDoc(node, design), [node, design]);
  const editor = useEditor({
    extensions,
    content: doc ?? '',
    editable: false,
    editorProps: { attributes: { class: noteStyles.editorContent, 'aria-label': LABELS.blockGuide.example } },
  });
  return <div className={styles.example}><EditorContent editor={editor} /></div>;
}
