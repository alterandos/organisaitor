import { forwardRef, useEffect, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { escapeHtml } from '@/utils/richText';
import { longToHtml } from '@/utils/longText';
import { pairsBeforeInput, pairsKeyDown } from '@/components/NoteEditor/extensions/cardFieldPairs';
import { domToLongLines, longTextKeyDown } from './longTextDom';

// A long field of plain text, lines and lists (an AI prompt's section, 2026-11-14), drawn outside
// the note editor: shown as bullets and numbers, kept as Markdown-style lines (utils/longText.ts).
// The list keys are longTextDom.ts's (as a Glossary card's long fields have); typing shortcuts and
// `//` come from fieldInput.ts, which serves every small contenteditable; brackets pair as in a card.
// Saved as typed (each input), never rewritten under the cursor.

export interface LongTextHandle { el: HTMLDivElement | null }

interface Props {
  value:       string;                 // "\n"-separated lines
  onChange:    (value: string) => void;
  editable:    boolean;
  label:       string;
  placeholder?: string;
  className?:  string;
  onPaste?:    (e: ClipboardEvent<HTMLDivElement>) => void;
  onKeyDown?:  (e: KeyboardEvent<HTMLDivElement>) => void;
  onCaret?:    () => void;            // the cursor moved in it (for "put {name} where the cursor is")
  fieldAttrs?: Record<string, string>;
}

const linesOf = (v: string) => (v ? v.split('\n') : []);
const draw = (v: string) => longToHtml(linesOf(v), escapeHtml);

export const LongTextField = forwardRef<LongTextHandle, Props>(function LongTextField({ value, onChange, editable, label, placeholder, className, onPaste, onKeyDown, onCaret, fieldAttrs }, handle) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(handle, () => ({ get el() { return ref.current; } }), []);
  const read = () => (ref.current ? domToLongLines(ref.current, { html: false }).join('\n') : '');
  // A change from elsewhere (undo, a new run, a paste that filled the prompt in) is drawn; what was
  // just typed here reads the same, so the field isn't rewritten under the cursor.
  useEffect(() => {
    const el = ref.current;
    if (!el || read() === value) return;
    el.innerHTML = draw(value);
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !editable) return;
    const before = (e: InputEvent) => { pairsBeforeInput(el, e); };
    el.addEventListener('beforeinput', before);
    return () => el.removeEventListener('beforeinput', before);
  }, [editable]);

  return (
    <div
      ref={ref}
      contentEditable={editable}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label={label}
      aria-readonly={!editable || undefined}
      tabIndex={0}
      data-long-text=""
      data-multiline=""
      data-placeholder={placeholder}
      className={className}
      {...fieldAttrs}
      onInput={() => { const el = ref.current!; if (!el.textContent && !el.querySelector('li')) el.innerHTML = ''; onChange(read()); }}
      onKeyDown={(e) => {
        if (editable && (longTextKeyDown(e, e.currentTarget) || pairsKeyDown(e.currentTarget, e))) return;
        onKeyDown?.(e);
      }}
      onKeyUp={onCaret}
      onMouseUp={onCaret}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        document.execCommand?.('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
});
