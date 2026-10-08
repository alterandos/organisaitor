import type { Fragment, Node as PMNode, Slice } from '@tiptap/pm/model';
import { LABELS } from '@/config/labels';
import { effectiveLevels } from './extensions/hierarchyLayout';
import { chartToTable, normalizeChart } from '@/charts/chartSpec';

// The plain text a copy from a note puts on the clipboard (editorProps.clipboardTextSerializer).
// Rich targets (Word, Docs, mail) take the HTML copy and keep everything; a plain-text target (a
// chat box, a terminal, a code editor) used to get the text with every heading, bullet and number
// turned into bare lines. This writes it the way people type structure in plain text — Markdown:
//   # Heading            - bullet            1. numbered          > quote
//   tables as tab-separated rows (pastes into a spreadsheet as cells), code in ``` fences,
//   timelines as "- When — what", quotes with their attribution, links as "text (url)".
// Copying a few words inside one block gives just those words, without the block's marker.

const INDENT = '   ';

function inlineText(node: PMNode): string {
  let out = '';
  node.forEach((child) => {
    if (child.isText) {
      const text = child.text ?? '';
      const link = child.marks.find((m) => m.type.name === 'link')?.attrs.href as string | undefined;
      out += link && link !== text && !text.includes(link) ? `${text} (${link})` : text;
    } else if (child.type.name === 'hardBreak') {
      out += '\n';
    } else if (child.isInline) {
      out += child.textContent;
    }
  });
  return out;
}

const prefixLines = (text: string, first: string, rest: string) =>
  text.split('\n').map((line, i) => (i === 0 ? first : rest) + line).join('\n');

function listItem(item: PMNode, marker: string): string {
  const parts: string[] = [];
  item.forEach((child) => parts.push(block(child)));
  return prefixLines(parts.join('\n'), marker, ' '.repeat(marker.length));
}

function block(node: PMNode): string {
  const name = node.type.name;
  switch (name) {
    case 'heading':
      return `${'#'.repeat(node.attrs.level as number)} ${inlineText(node)}`;
    case 'noteTitle':
      return `# ${inlineText(node)}`;
    case 'bulletList':
    case 'taskList': {
      const items: string[] = [];
      node.forEach((item) => items.push(listItem(item, '- ')));
      return items.join('\n');
    }
    case 'orderedList': {
      const start = (node.attrs.start as number | undefined) ?? 1;
      const items: string[] = [];
      node.forEach((item, _o, i) => items.push(listItem(item, `${start + i}. `)));
      return items.join('\n');
    }
    case 'blockquote':
      return prefixLines(children(node.content, '\n'), '> ', '> ');
    case 'codeBlock':
      return `\`\`\`${(node.attrs.language as string | null) ?? ''}\n${node.textContent}\n\`\`\``;
    case 'horizontalRule':
      return '---';
    case 'image':
      return '';
    case 'table': {
      const rows: string[] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(children(cell.content, ' ').replace(/\s*\n\s*/g, ' ')));
        rows.push(cells.join('\t'));
      });
      return rows.join('\n');
    }
    case 'timeline': {
      const items: string[] = [];
      node.forEach((item) => {
        const when = inlineText(item.child(0));
        const body: string[] = [];
        item.forEach((child, _o, i) => { if (i > 0) body.push(block(child)); });
        const text = body.join('\n');
        items.push(prefixLines(when ? `${when} — ${text}` : text, '- ', INDENT));
      });
      return items.join('\n');
    }
    case 'cycle': {
      // "Water cycle" then "- Ocean — notes" per stage, each arrow on its own line with its name,
      // the last one back to the first.
      const ARROWS: Record<string, string> = { forward: '→', back: '←', both: '↔' };
      const lines: string[] = [];
      const name = inlineText(node.child(0));
      if (name) lines.push(name);
      const first = node.childCount > 1 ? inlineText(node.child(1).child(0)) : '';
      node.forEach((stage, _o, i) => {
        if (i === 0) return;
        const label = inlineText(stage.child(0));
        const text = inlineText(stage.child(1));
        lines.push(`- ${label}${text ? ` — ${text}` : ''}`);
        const arrow = `${ARROWS[stage.attrs.arrow as string] ?? '→'}${stage.attrs.arrowLabel ? ` ${stage.attrs.arrowLabel}` : ''}`;
        lines.push(i === node.childCount - 1 ? `  ${arrow} (back to ${first})` : `  ${arrow}`);
      });
      return lines.join('\n');
    }
    case 'breakdown': {
      // "Democracy, made up of:" then "- Free press — what it brings" per part.
      const whole = inlineText(node.child(0));
      const lines: string[] = [whole ? `${whole}, made up of:` : 'Made up of:'];
      node.forEach((part, _o, i) => {
        if (i === 0) return;
        const text = inlineText(part.child(1));
        lines.push(`- ${inlineText(part.child(0))}${text ? ` — ${text}` : ''}`);
      });
      return lines.join('\n');
    }
    case 'chart': {
      // The title, then the data as a tab-separated table (pastes into a spreadsheet).
      const spec = normalizeChart(node.attrs.spec);
      return [spec.title, chartToTable(spec)].filter(Boolean).join('\n');
    }
    case 'pyramid': {
      // "Pyramid, top to bottom:" then "1. Self-actualisation — becoming who you can be".
      const lines = [`${LABELS.noteBlocks.pyramid.label}, ${LABELS.noteBlocks.pyramid.topToBottom}:`];
      node.forEach((layer, _o, i) => {
        const text = inlineText(layer.child(1));
        lines.push(`${i + 1}. ${inlineText(layer.child(0))}${text ? ` — ${text}` : ''}`);
      });
      return lines.join('\n');
    }
    case 'hierarchy': {
      // An indented list, each item with its level's name: "  - Phylum: Chordata".
      const tiers = node.attrs.tiers as string[];
      const levels: number[] = [];
      node.forEach((item) => levels.push(item.attrs.level as number));
      const eff = effectiveLevels(levels);
      const lines: string[] = [];
      node.forEach((item, _o, i) => {
        const tier = tiers[eff[i]];
        lines.push(`${'  '.repeat(eff[i])}- ${tier ? `${tier}: ` : ''}${inlineText(item)}`);
      });
      return lines.join('\n');
    }
    case 'quoteBlock': {
      const text = inlineText(node.child(0));
      const fields: string[] = [];
      node.forEach((child, _o, i) => { if (i > 0 && child.textContent.trim()) fields.push(inlineText(child)); });
      const quote = `“${text}”`;
      return prefixLines(fields.length ? `${quote}\n— ${fields.join(', ')}` : quote, '> ', '> ');
    }
    default:
      return node.isTextblock ? inlineText(node) : children(node.content);
  }
}

// Blocks one after another: a blank line between them, like paragraphs in Markdown.
function children(content: Fragment, sep = '\n\n'): string {
  const parts: string[] = [];
  content.forEach((child) => {
    const text = block(child);
    if (text !== '') parts.push(text);
  });
  return parts.join(sep);
}

export function noteClipboardText(slice: Slice): string {
  // Part of one block (a few words of a heading, a list item): just the words.
  let node: Fragment = slice.content;
  while (node.childCount === 1 && !node.firstChild!.isTextblock && !node.firstChild!.isText) node = node.firstChild!.content;
  if (slice.openStart > 0 && node.childCount === 1 && node.firstChild!.isTextblock) return inlineText(node.firstChild!);
  if (node.childCount > 0 && node.firstChild!.isText) {
    let out = '';
    node.forEach((c) => { out += c.text ?? ''; });
    return out;
  }
  return children(slice.content).replace(/\n{3,}/g, '\n\n');
}
