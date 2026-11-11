import { log } from '@/utils/log';
import styles from './completionBurst.module.css';

// The little celebration when a task is completed (2026-11-11): the checkbox pops on a spring, a
// ring spreads from it and a few sparks fly out and fade. Drawn in its own layer on <body>, from
// where the checkbox is at that moment, so it plays out even if the row moves or goes. Motion
// (the library) is loaded the first time, never in the first load. Nothing with reduced motion.
// Every animation in the suite goes through src/animations/ (see CLAUDE.md "Animations").

const SPARKS = 10;
const SPARK_TOKENS = ['--color-success', '--color-primary', '--color-level-medium', '--color-success', '--color-warning'];

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function completionBurst(anchor: HTMLElement | null): Promise<void> {
  if (!anchor || !anchor.isConnected || reducedMotion()) return;
  const box = anchor.getBoundingClientRect();
  if (!box.width) return;
  let animate: typeof import('./motionLib').animate;
  try { ({ animate } = await import('./motionLib')); } catch (e) { log.warn('animations', 'motion did not load', e); return; }

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const layer = document.createElement('div');
  layer.className = styles.layer;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${cx}px`;
  layer.style.top = `${cy}px`;
  document.body.append(layer);

  const ring = document.createElement('span');
  ring.className = styles.ring;
  ring.style.width = ring.style.height = `${box.width}px`;
  layer.append(ring);

  const runs: Promise<unknown>[] = [
    animate(ring, { scale: [0.6, 2.4], opacity: [0.7, 0] }, { duration: 0.5, ease: 'easeOut' }).finished,
  ];
  if (anchor.isConnected) {
    // A spring takes two keyframes: down a little, then back past its size and settling.
    animate(anchor, { scale: [0.7, 1] }, { type: 'spring', stiffness: 600, damping: 11 });
  }
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement('span');
    spark.className = styles.spark;
    spark.style.background = `var(${SPARK_TOKENS[i % SPARK_TOKENS.length]})`;
    layer.append(spark);
    const angle = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.5;
    const dist = box.width * (1.3 + Math.random() * 0.9);
    runs.push(animate(spark, {
      x: [0, Math.cos(angle) * dist], y: [0, Math.sin(angle) * dist],
      scale: [1, 0.3], opacity: [1, 0],
    }, { duration: 0.55 + Math.random() * 0.2, ease: [0.2, 0.7, 0.3, 1] }).finished);
  }
  await Promise.allSettled(runs);
  layer.remove();
}
