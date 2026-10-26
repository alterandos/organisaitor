import type { ReactNode } from 'react';
import { usePictureSrc } from '@/services/pictures';
import { pictureOfIcon } from './iconValue';
import styles from './IconPicker.module.css';

// THE way to show an icon a person picked (iconValue.ts): an emoji as text, or an icon picture as a
// small square image the size of the text around it. `fallback` shows when there's no icon (and
// while a picture isn't available, e.g. not synced to this device yet). A drawn icon (a Place's
// component, in Quick Access) is shown as it is.
export function ItemIcon({ icon, fallback = '', className }: { icon: ReactNode; fallback?: string; className?: string }) {
  const pictureId = typeof icon === 'string' ? pictureOfIcon(icon) : null;
  const src = usePictureSrc(pictureId);
  if (pictureId) {
    return src
      ? <img src={src} alt="" className={`${styles.picture} ${className ?? ''}`} draggable={false} />
      : <span className={className}>{fallback}</span>;
  }
  return <span className={className}>{icon === null || icon === undefined || icon === '' ? fallback : icon}</span>;
}
