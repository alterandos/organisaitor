// Formatting a block's own text field (a Glossary card's: extensions/GlossaryCardBody.tsx), when
// that's where the cursor is, rather than the note's text: the ribbon's buttons ask here first.
// The fields keep their formatting as a little HTML (utils/richText.ts), written by the browser's
// own editing commands.
export type FieldFormat = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'superscript' | 'subscript';

export function formatFocusedBlockField(cmd: FieldFormat): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el?.hasAttribute('data-card-input') || el.getAttribute('contenteditable') !== 'true') return false;
  document.execCommand?.(cmd);
  return true;
}
