// How a Glossary card shows its record's picture: its width (px; null = the usual) and where it
// sits: in the fields' order, to the right of them, or after them. Kept on the card node (like its
// width), drawn by GlossaryCardBody's ImageField.
export const IMAGE_PLACES = ['flow', 'right', 'bottom'] as const;
export type ImagePlace = typeof IMAGE_PLACES[number];
export interface ImageLayout { width: number | null; place: ImagePlace }
export const DEFAULT_IMAGE_LAYOUT: ImageLayout = { width: null, place: 'flow' };
