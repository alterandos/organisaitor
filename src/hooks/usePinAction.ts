import { createElement } from 'react';
import { usePinnedItemsStore, pinKey, type PinnableType } from '@/store/pinnedItemsStore';
import { togglePin } from '@/services/quickAccessPins';
import { PinIcon, UnpinIcon } from '@/components/Icons';
import { LABELS } from '@/config/labels';

// A pin button's icon, label and action, following whether the item is pinned. Spread it into a
// RowAction (`<RowAction {...pin} className={…} />`, so the ⋯ menu, right-click and the Android
// long-press sheet all offer it) or use it for a header button.
export function usePinAction(type: PinnableType, entityId: string) {
  const pinned = usePinnedItemsStore((s) => pinKey(type, entityId) in s.pins);
  return {
    icon:    createElement(pinned ? UnpinIcon : PinIcon),
    label:   pinned ? LABELS.quickAccess.unpin : LABELS.quickAccess.pin,
    onClick: () => togglePin(type, entityId),
  };
}
