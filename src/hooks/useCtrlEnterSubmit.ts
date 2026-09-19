import { useEffect, useRef } from 'react';

// THE Ctrl+Enter rule for modals and panes with a form-less primary action (a plain "Save"
// button rather than a <form> submit): Ctrl+Enter (Cmd+Enter on Mac) runs that action, so a
// keyboard-only user in a multi-line field can always save. Forms keep the established
// `formRef.current?.requestSubmit()` pattern — pass that as `onSubmit` here too.
//
// `onSubmit` is read through a ref that is refreshed every render, so it can be an inline
// closure over current state without re-registering the listener or ever calling a stale
// version. Call this hook above any early `return null`, and pass `active` = the same
// condition the early return uses, so the handler can't fire while nothing is rendered.
export function useCtrlEnterSubmit(onSubmit: () => void, active = true) {
  const ref = useRef(onSubmit);
  useEffect(() => { ref.current = onSubmit; });

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ref.current(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active]);
}
