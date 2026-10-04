import { createContext } from 'react';

// Set by RowHoverActionsMenu while its actions are showing in the Android long-press sheet:
// RowAction then renders as a labelled sheet row, and closes the sheet when chosen.
export const RowActionsSheetContext = createContext<{ close: () => void } | null>(null);
