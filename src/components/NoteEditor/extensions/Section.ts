import { Node, mergeAttributes } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import { canSplit } from '@tiptap/pm/transform';
import { Fragment, Node as PMNode, Schema } from '@tiptap/pm/model';

export const MAX_SECTION_COLUMNS = 4;

// Every note's document is now a sequence of sections (content: 'section+') rather than
// a flat list of blocks. Each section carries its own column count, and a "section break"
// splits the document at the cursor into two independently-configurable sections — this
// mirrors Word's page-layout sections and gives future per-section settings (margins,
// page breaks, etc.) a container to live in without another schema migration.
export const SectionDocument = Document.extend({
  content: 'section+',
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    section: {
      setSectionColumns: (columns: number, pos: number) => ReturnType;
      insertSectionBreak: () => ReturnType;
      toggleSectionLocked: (pos: number) => ReturnType;
    };
  }
}

function findSectionDepth(sectionTypeName: string, $pos: import('@tiptap/pm/model').ResolvedPos): number {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === sectionTypeName) return d;
  }
  return -1;
}

// Distributes `items` contiguously across `parts` groups, front-loading any remainder
// (e.g. 5 items / 2 parts -> [3, 2]) so "lock columns" reads as a natural top-to-bottom split.
function chunkEvenly<T>(items: T[], parts: number): T[][] {
  const result: T[][] = [];
  const base = Math.floor(items.length / parts);
  const extra = items.length % parts;
  let idx = 0;
  for (let p = 0; p < parts; p++) {
    const count = base + (p < extra ? 1 : 0);
    result.push(items.slice(idx, idx + count));
    idx += count;
  }
  return result;
}

// Reads a locked section's current content back out as one flat block list (column order,
// each column's blocks in order) — used both when unlocking and when changing column count
// on an already-locked section.
function flattenSectionContent(sectionNode: PMNode, schema: Schema): PMNode[] {
  const columnBlockType = schema.nodes.columnBlock;
  const blocks: PMNode[] = [];
  sectionNode.forEach((child) => {
    if (columnBlockType && child.type === columnBlockType) {
      child.forEach((column) => column.forEach((block) => blocks.push(block)));
    } else {
      blocks.push(child);
    }
  });
  return blocks;
}

// Builds a single columnBlock node containing `count` columns, distributing `blocks` across
// them; empty columns get a blank paragraph so they satisfy column's `content: 'block+'`.
function buildColumnBlock(blocks: PMNode[], count: number, schema: Schema): PMNode | null {
  const columnBlockType = schema.nodes.columnBlock;
  const columnType = schema.nodes.column;
  const paragraphType = schema.nodes.paragraph;
  if (!columnBlockType || !columnType || !paragraphType) return null;
  const chunks = chunkEvenly(blocks, count);
  const columnNodes = chunks.map((chunk) =>
    columnType.create(null, Fragment.from(chunk.length ? chunk : [paragraphType.create()]))
  );
  return columnBlockType.create(null, Fragment.from(columnNodes));
}

export const Section = Node.create({
  name: 'section',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 1,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-columns') || '1', 10);
          return Number.isFinite(n) && n >= 1 && n <= MAX_SECTION_COLUMNS ? n : 1;
        },
        renderHTML: (attrs) => ({ 'data-columns': attrs.columns }),
      },
      locked: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-locked') === 'true',
        renderHTML: (attrs) => ({ 'data-locked': attrs.locked ? 'true' : 'false' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'section' }), 0];
  },

  addCommands() {
    return {
      setSectionColumns:
        (columns: number, pos: number) =>
        ({ state, dispatch }) => {
          const $pos = state.doc.resolve(pos);
          const depth = findSectionDepth(this.name, $pos);
          if (depth === -1) return false;
          const sectionPos = $pos.before(depth);
          const sectionNode = state.doc.nodeAt(sectionPos);
          if (!sectionNode) return false;
          const clamped = Math.max(1, Math.min(MAX_SECTION_COLUMNS, Math.round(columns)));

          if (dispatch) {
            const tr = state.tr;
            if (sectionNode.attrs.locked) {
              // Re-flatten then re-split across the new column count, preserving all content.
              const blocks = flattenSectionContent(sectionNode, state.schema);
              const columnBlock = buildColumnBlock(blocks, clamped, state.schema);
              if (columnBlock) {
                tr.replaceWith(sectionPos + 1, sectionPos + sectionNode.nodeSize - 1, Fragment.from([columnBlock]));
              }
            }
            tr.setNodeMarkup(sectionPos, undefined, { ...sectionNode.attrs, columns: clamped });
            dispatch(tr);
          }
          return true;
        },

      insertSectionBreak:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          const depth = findSectionDepth(this.name, $from);
          if (depth === -1) return false;

          // Splitting through a locked columns block isn't well-defined (which column's
          // sibling columns would go where?) — require unlocking first.
          for (let d = depth + 1; d <= $from.depth; d++) {
            if ($from.node(d).type.name === 'columnBlock') return false;
          }

          const sectionType = $from.node(depth).type;
          const splitDepth = $from.depth - depth + 1;
          const typesAfter: (null | { type: typeof sectionType; attrs: { columns: number; locked: boolean } })[] =
            new Array(splitDepth).fill(null);
          typesAfter[0] = { type: sectionType, attrs: { columns: 1, locked: false } };

          if (!canSplit(state.doc, $from.pos, splitDepth, typesAfter)) return false;
          if (dispatch) dispatch(state.tr.split($from.pos, splitDepth, typesAfter));
          return true;
        },

      toggleSectionLocked:
        (pos: number) =>
        ({ state, dispatch }) => {
          const $pos = state.doc.resolve(pos);
          const depth = findSectionDepth(this.name, $pos);
          if (depth === -1) return false;
          const sectionPos = $pos.before(depth);
          const sectionNode = state.doc.nodeAt(sectionPos);
          if (!sectionNode) return false;

          const wasLocked = !!sectionNode.attrs.locked;
          const columnsCount = Math.max(1, Math.min(MAX_SECTION_COLUMNS, sectionNode.attrs.columns ?? 1));

          if (dispatch) {
            const tr = state.tr;
            const blocks = flattenSectionContent(sectionNode, state.schema);

            let newContent: Fragment | null = null;
            if (!wasLocked) {
              const columnBlock = buildColumnBlock(blocks, columnsCount, state.schema);
              if (columnBlock) newContent = Fragment.from([columnBlock]);
            } else {
              const paragraphType = state.schema.nodes.paragraph;
              newContent = Fragment.from(blocks.length ? blocks : [paragraphType.create()]);
            }
            if (!newContent) return false;

            tr.replaceWith(sectionPos + 1, sectionPos + sectionNode.nodeSize - 1, newContent);
            tr.setNodeMarkup(sectionPos, undefined, { ...sectionNode.attrs, locked: !wasLocked });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

// A row of independently-editable columns inside a (locked) section. Only ever created via
// Section's toggleSectionLocked/setSectionColumns commands — content in one `column` never
// reflows into another, unlike the CSS `column-count` layout used when a section is unlocked.
export const ColumnBlock = Node.create({
  name: 'columnBlock',
  group: 'block',
  content: 'column+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column-block' }), 0];
  },
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column' }), 0];
  },
});
