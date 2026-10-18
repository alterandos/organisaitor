import { createElement } from 'react';
import { usePinnedItemsStore, pinKey, PINNABLE_TYPES, type PinnableType } from '@/store/pinnedItemsStore';
import type { QuickAccessTargetType } from '@/store/recentItemsStore';
import { resolveQuickAccessItem } from '@/utils/quickAccess';
import { showToast } from '@/components/Toast/showToast';
import { PinIcon, UnpinIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';
import type { ContextMenuItem } from '@/contextMenu/types';
import { registerContextMenuProvider } from '@/contextMenu/registry';
import { useNoteStore } from '@/store/noteStore';
import type { Note, NoteId } from '@/types/notes';

// Pinning to Quick Access (CLAUDE.md "Pin to Quick Access"): every pin button and pin menu item
// goes through togglePin, so they all say the same thing and all offer Undo.

export const isPinnable = (type: QuickAccessTargetType): type is PinnableType =>
  (PINNABLE_TYPES as readonly string[]).includes(type);

export const isPinned = (type: PinnableType, entityId: string): boolean =>
  pinKey(type, entityId) in usePinnedItemsStore.getState().pins;

export function togglePin(type: PinnableType, entityId: string): void {
  const store = usePinnedItemsStore.getState();
  const name = resolveQuickAccessItem(type, entityId)?.title ?? '';
  if (isPinned(type, entityId)) {
    const before = store.pins[pinKey(type, entityId)];
    store.unpin(type, entityId);
    showToast({
      message: LABELS.quickAccess.unpinnedToast(name),
      // Back in the place it had.
      actions: [{ label: LABELS.quickAccess.undo, onClick: () => usePinnedItemsStore.setState((s) => ({ pins: { ...s.pins, [before.id]: before } })) }],
    });
  } else {
    store.pin(type, entityId);
    showToast({
      message: LABELS.quickAccess.pinnedToast(name),
      actions: [{ label: LABELS.quickAccess.undo, onClick: () => usePinnedItemsStore.getState().unpin(type, entityId) }],
    });
  }
}

// The right-click entry, for a menu built at click time.
export function pinMenuItem(type: PinnableType, entityId: string): ContextMenuItem {
  const pinned = isPinned(type, entityId);
  return {
    id: 'quick-access-pin',
    label: pinned ? LABELS.quickAccess.unpin : LABELS.quickAccess.pin,
    icon: createElement(pinned ? UnpinIcon : PinIcon),
    run: () => togglePin(type, entityId),
  };
}

// Every note row and card (the notes list, the Mosaic) offers it on right-click.
registerContextMenuProvider({
  id: 'note-row.quick-access-pin',
  kind: 'note-row',
  order: 60,
  items: (_ctx, scope) => {
    const id = (scope.data as { noteId?: string } | undefined)?.noteId;
    return id ? [pinMenuItem('note', id)] : [];
  },
});

// Before pins, a note had its own "Pinned" flag (2026-10-18: it was saved but nothing read it).
// A note still carrying it is pinned here once and the flag dropped, without touching updatedAt.
// Remove this once every device has opened the app since.
export function adoptLegacyNotePins(): void {
  const legacy = Object.values(useNoteStore.getState().notes).filter((n) => 'pinned' in n);
  if (legacy.length === 0) return;
  for (const n of legacy) if ((n as Note & { pinned?: boolean }).pinned) usePinnedItemsStore.getState().pin('note', n.id);
  useNoteStore.setState((s) => {
    const notes = { ...s.notes };
    for (const n of legacy) {
      const copy = { ...notes[n.id as NoteId] } as Note & { pinned?: boolean };
      delete copy.pinned;
      notes[n.id as NoteId] = copy;
    }
    return { notes };
  });
}
