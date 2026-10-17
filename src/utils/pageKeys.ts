import { hasOpenOverlay } from '@/hooks/useEscapeClose';
import { isTypingTarget } from '@/utils/typingTarget';

// THE check a section's own hotkeys make before acting (CLAUDE.md "Page hotkeys stand aside",
// 2026-10-17): not while the person is typing, and not while an overlay (a modal, a pane, a
// dialog, a popover) is open over the page — the key belongs to the overlay then. Overlays are
// known from the Escape stack, which every one of them registers with, so a new modal or pane is
// covered without touching any hotkey. A panel docked beside the page (Calendar's side pane)
// registers as `docked` and doesn't block.
//
// Never list open-state flags instead (`openModal || editingTaskId || …`): such a list misses the
// next overlay someone adds (it had in Calendar: the day pane; Lists had no check at all).
export function pageKeyBlocked(target: KeyboardEvent | Element | null): boolean {
  return isTypingTarget(target) || hasOpenOverlay();
}
