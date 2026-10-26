import { pictureIdOf, pictureRef } from '@/services/pictures';

// An icon a person picks (a notebook's, a list's, an Overview's, an activity type's, a converter's)
// is one string: an emoji, or a picture from the library ("picture:<id>", a small square icon
// picture: services/pictures.ts addIconPicture). Shown with <ItemIcon>; where only text can go
// (a native <option>, a page title) iconText gives the emoji, or the fallback for a picture.

export const iconOfPicture = (id: string): string => pictureRef(id);
export const pictureOfIcon = (icon: string | null | undefined): string | null => pictureIdOf(icon);
export const isPictureIcon = (icon: string | null | undefined): boolean => !!pictureOfIcon(icon);

export function iconText(icon: string | null | undefined, fallback = ''): string {
  if (!icon) return fallback;
  return isPictureIcon(icon) ? fallback : icon;
}

// The first character a person typed or pasted (one emoji, however many code points it is).
export function firstGrapheme(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return [...new Intl.Segmenter().segment(t)][0]?.segment ?? null;
}
