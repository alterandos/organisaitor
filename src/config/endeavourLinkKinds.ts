import type { EndeavourLinkKind } from '@/types';
import { LABELS } from '@/config/labels';

// What each kind of link between Endeavours means (docs/features/endeavours.md). A new kind is one
// entry here, its label in LABELS.endeavourLinks and a member of EndeavourLinkKind: never a migration,
// since links are stored as a list on the Endeavour.
//   rollsUp:   the linking Endeavour's items show in the one it links to ("everything for X")
//   symmetric: the link reads the same from both ends (shown on both, stored once)
export interface EndeavourLinkKindDef {
  label:     string;   // from the linking Endeavour's side: "Part of"
  inverse:   string;   // from the other side: "Contains"
  rollsUp:   boolean;
  symmetric: boolean;
}

export const ENDEAVOUR_LINK_KINDS: Record<EndeavourLinkKind, EndeavourLinkKindDef> = {
  partOf:  { label: LABELS.endeavourLinks.partOf,  inverse: LABELS.endeavourLinks.contains, rollsUp: true,  symmetric: false },
  related: { label: LABELS.endeavourLinks.related, inverse: LABELS.endeavourLinks.related,  rollsUp: false, symmetric: true },
};
