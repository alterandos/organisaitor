import { usePinAction } from '@/hooks/usePinAction';
import type { PinnableType } from '@/store/pinnedItemsStore';

// The pin / unpin button beside an item's own heading (a list, a tracker, a routine). The site
// gives it its own button style; the icon and label follow whether the item is pinned.
export function PinButton({ type, id, className }: { type: PinnableType; id: string; className?: string }) {
  const pin = usePinAction(type, id);
  return (
    <button type="button" className={className} onClick={pin.onClick} title={pin.label} aria-label={pin.label}>
      {pin.icon}
    </button>
  );
}
