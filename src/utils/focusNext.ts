const TABBABLE = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Focuses the next control after `container` in Tab order, for a segmented field (TimeInput,
// DateInput) moving on by itself once its value is complete. Controls inside `container` are skipped.
export function focusNextAfter(container: HTMLElement): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE))
    .filter((el) => el.tabIndex >= 0 && (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true));
  const next = all.find((el) => !container.contains(el) && (container.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  next?.focus();
}
