import { useEffect, useRef, useState, type RefObject } from 'react';
import { toggleWrap, insertMarkdownLink, type TextEditResult } from '@/utils/markdownTextEdit';

export interface MarkdownLinkPromptState { anchorRect: DOMRect; initialText: string; selStart: number; selEnd: number }

// "Light rich text" for plain-<textarea> notes fields (Task/Calendar — see "Light rich text" in
// Implemented features for why these stayed plain text/Markdown rather than becoming a real
// Tiptap instance like Notes). Ctrl+B/Ctrl+I wrap the selection in Markdown bold/italic syntax
// (toggling it off if already wrapped); Ctrl+L opens a small text+URL prompt (see
// components/MarkdownLinkPrompt) and inserts `[text](url)` on confirm. Attached directly to the
// textarea element (not `document`), so it only fires while that field is actually focused.
export function useMarkdownHotkeys(ref: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (v: string) => void) {
  const [linkPrompt, setLinkPrompt] = useState<MarkdownLinkPromptState | null>(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; });

  const apply = (result: TextEditResult) => {
    onChange(result.value);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        apply(toggleWrap(valueRef.current, el.selectionStart, el.selectionEnd, '**'));
      } else if (key === 'i') {
        e.preventDefault();
        apply(toggleWrap(valueRef.current, el.selectionStart, el.selectionEnd, '*'));
      } else if (key === 'l') {
        e.preventDefault();
        setLinkPrompt({
          anchorRect: el.getBoundingClientRect(),
          initialText: valueRef.current.slice(el.selectionStart, el.selectionEnd),
          selStart: el.selectionStart,
          selEnd: el.selectionEnd,
        });
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
    // Runs once on mount: refs attach during React's commit phase, strictly before this effect
    // ever runs, so `ref.current` is already the real node the first (and only) time this body
    // executes — no need to re-run on a `ref.current` change (an anti-pattern anyway, since
    // mutating a ref doesn't trigger a re-render for the dependency array to observe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmLink = (url: string, linkText: string) => {
    if (!linkPrompt) return;
    apply(insertMarkdownLink(valueRef.current, linkPrompt.selStart, linkPrompt.selEnd, url, linkText));
    setLinkPrompt(null);
  };
  const cancelLink = () => setLinkPrompt(null);

  return { linkPrompt, confirmLink, cancelLink };
}
