import Image from '@tiptap/extension-image';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import { LABELS } from '@/config/labels';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import {
  type Crop, type Handle, NO_CROP, CORNERS, EDGES, cropDrag, isCropped, parseCrop, resizeDrag, serializeCrop,
} from './imageGeometry';
import styles from './ResizableImage.module.css';

// A note's picture, sized and cropped the way a word processor does it. Selecting it shows eight
// handles: a corner keeps the picture's shape, an edge stretches it one way. "Crop" swaps them for
// crop handles over the whole picture, the cut-away parts shown dimmed; Enter, Done or a click
// elsewhere applies, Esc cancels. Nothing is cut out of the image itself: `crop` (fractions of
// each side) and `height` (set only once it has been stretched) are attributes, so a crop can be
// widened again later. The geometry is pure, in imageGeometry.ts.

type Attrs = { src: string; alt?: string | null; title?: string | null; width: number | null; height: number | null; crop: Crop };

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || el.style.width;
          return w ? parseInt(w, 10) || null : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: String(attrs.width) } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute('height');
          return h ? parseInt(h, 10) || null : null;
        },
        renderHTML: (attrs) => (attrs.height ? { height: String(attrs.height) } : {}),
      },
      crop: {
        default: NO_CROP,
        parseHTML: (el) => parseCrop(el.getAttribute('data-crop')),
        renderHTML: (attrs) => (isCropped(attrs.crop as Crop) ? { 'data-crop': serializeCrop(attrs.crop as Crop) } : {}),
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => new ImageView(node, editor, typeof getPos === 'function' ? getPos : () => undefined);
  },
});

const HANDLES: Handle[] = [...CORNERS, ...EDGES];

class ImageView {
  dom: HTMLElement;
  private frame: HTMLElement;
  private clip: HTMLElement;
  private img: HTMLImageElement;
  private bar: HTMLElement;
  private handles: HTMLElement;
  private attrs: Attrs;
  private natural: { w: number; h: number } | null = null;
  private cropping: { crop: Crop; full: { w: number; h: number }; release: () => void } | null = null;
  private stage: HTMLElement | null = null;
  private drag: (() => void) | null = null;

  private editor: Editor;
  private getPos: () => number | undefined;

  constructor(node: PMNode, editor: Editor, getPos: () => number | undefined) {
    this.editor = editor;
    this.getPos = getPos;
    this.attrs = node.attrs as Attrs;
    this.dom = el('span', styles.wrap);
    this.frame = el('span', styles.frame);
    this.clip = el('span', styles.clip);
    this.img = document.createElement('img');
    this.img.className = styles.img;
    this.img.draggable = false;
    this.img.addEventListener('load', () => {
      this.natural = { w: this.img.naturalWidth, h: this.img.naturalHeight };
      this.layout();
    });
    this.clip.appendChild(this.img);
    this.frame.appendChild(this.clip);
    this.dom.appendChild(this.frame);

    this.handles = el('span', styles.handles);
    for (const h of HANDLES) {
      const knob = el('span', `${styles.handle} ${styles[`h_${h}`]}`);
      knob.dataset.handle = h;
      knob.addEventListener('pointerdown', (e) => this.startResize(e, h));
      this.handles.appendChild(knob);
    }
    this.frame.appendChild(this.handles);

    this.bar = el('span', styles.bar);
    this.bar.appendChild(button(LABELS.noteImage.crop, () => this.startCrop()));
    this.bar.appendChild(button(LABELS.noteImage.originalSize, () => this.commit({ width: null, height: null }), LABELS.noteImage.originalSizeHint));
    this.dom.appendChild(this.bar);

    this.apply(node);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private apply(node: PMNode) {
    this.attrs = node.attrs as Attrs;
    if (this.img.getAttribute('src') !== this.attrs.src) this.img.src = this.attrs.src;
    this.img.alt = this.attrs.alt ?? '';
    if (this.attrs.title) this.img.title = this.attrs.title;
    this.layout();
  }

  // The frame is the visible picture: its width (capped at the column) and shape. The image
  // inside is the whole picture, sized and offset so only the crop shows.
  private layout() {
    const { width, height, crop } = this.attrs;
    const cropped = isCropped(crop);
    const fw = 1 - crop.left - crop.right;
    const fh = 1 - crop.top - crop.bottom;
    const ratio = height && width
      ? width / height
      : this.natural ? (this.natural.w * fw) / (this.natural.h * fh) : null;
    this.frame.style.width = width ? `${width}px` : '';
    const framed = cropped || !!height;
    this.frame.classList.toggle(styles.framed, framed);
    this.clip.style.aspectRatio = framed && ratio ? String(ratio) : '';
    if (framed) {
      this.positionImage();
    } else {
      this.img.style.height = this.img.style.left = this.img.style.top = '';
      this.img.style.width = width ? '100%' : '';
    }
    this.bar.querySelector<HTMLButtonElement>('button:nth-child(2)')!.disabled = !width && !height;
  }

  // ── Resizing ──────────────────────────────────────────────────────────────

  private startResize(e: PointerEvent, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this.clip.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
    const stretched = !!this.attrs.height;
    let result = { width: start.w, height: start.h, stretched };
    this.dom.classList.add(styles.resizing);
    this.follow(e, (ev) => {
      result = resizeDrag(handle, start, ev.clientX - start.x, ev.clientY - start.y, stretched);
      this.frame.style.width = `${result.width}px`;
      const framed = isCropped(this.attrs.crop) || result.stretched;
      this.frame.classList.toggle(styles.framed, framed);
      this.clip.style.aspectRatio = framed ? String(result.width / result.height) : '';
      if (framed) this.positionImage();
      else this.img.style.width = '100%';
    }, () => {
      this.dom.classList.remove(styles.resizing);
      this.commit({ width: result.width, height: result.stretched ? result.height : null });
    });
  }

  private positionImage() {
    const { crop } = this.attrs;
    const fw = 1 - crop.left - crop.right;
    const fh = 1 - crop.top - crop.bottom;
    this.img.style.width = `${100 / fw}%`;
    this.img.style.height = `${100 / fh}%`;
    this.img.style.left = `${(-crop.left / fw) * 100}%`;
    this.img.style.top = `${(-crop.top / fh) * 100}%`;
  }

  // Pointer capture on the handle, so a drag keeps working off the image and with touch.
  private follow(e: PointerEvent, onMove: (ev: PointerEvent) => void, onDone: () => void) {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { ev.preventDefault(); onMove(ev); };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      this.drag = null;
      onDone();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    this.drag = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
  }

  private commit(patch: Partial<Attrs>) {
    const pos = this.getPos();
    if (pos == null) return;
    const view = this.editor.view;
    const attrs = { ...this.attrs, ...patch };
    if (attrs.width) attrs.width = Math.round(attrs.width);
    if (attrs.height) attrs.height = Math.round(attrs.height);
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
  }

  // ── Cropping ──────────────────────────────────────────────────────────────

  private startCrop() {
    if (this.cropping) return;
    const rect = this.clip.getBoundingClientRect();
    const crop = { ...this.attrs.crop };
    const fw = 1 - crop.left - crop.right;
    const fh = 1 - crop.top - crop.bottom;
    // The whole picture at the scale it's shown at now; shrunk to fit the column if it's wider.
    const column = this.dom.getBoundingClientRect().width || rect.width / fw;
    const scale = Math.min(1, column / (rect.width / fw));
    const full = { w: (rect.width / fw) * scale, h: (rect.height / fh) * scale };

    const stage = el('span', styles.stage);
    stage.style.width = `${full.w}px`;
    stage.style.height = `${full.h}px`;
    const whole = document.createElement('img');
    whole.src = this.attrs.src;
    whole.className = styles.stageImg;
    whole.draggable = false;
    const box = el('span', styles.cropBox);
    for (const h of HANDLES) {
      const knob = el('span', `${styles.cropHandle} ${styles[`c_${h}`]}`);
      knob.addEventListener('pointerdown', (e) => this.dragCrop(e, h));
      box.appendChild(knob);
    }
    box.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    stage.append(whole, box);

    const cropBar = el('span', `${styles.bar} ${styles.cropBar}`);
    cropBar.appendChild(button(LABELS.noteImage.resetCrop, () => { if (this.cropping) { this.cropping.crop = { ...NO_CROP }; this.drawCrop(); } }));
    cropBar.appendChild(button(LABELS.noteImage.cancel, () => this.endCrop(false)));
    const done = button(LABELS.noteImage.done, () => this.endCrop(true));
    done.classList.add(styles.primary);
    cropBar.appendChild(done);

    this.dom.classList.add(styles.croppingMode);
    this.dom.append(stage, cropBar);
    this.stage = stage;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      this.endCrop(true);
    };
    const onOutside = (e: PointerEvent) => { if (!this.dom.contains(e.target as Node)) this.endCrop(true); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    const unEscape = registerEscapeClose(() => this.endCrop(false));
    this.cropping = {
      crop, full,
      release: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onOutside, true);
        unEscape();
      },
    };
    this.drawCrop();
  }

  private drawCrop() {
    if (!this.cropping || !this.stage) return;
    const { crop } = this.cropping;
    const box = this.stage.querySelector<HTMLElement>(`.${styles.cropBox}`)!;
    box.style.left = `${crop.left * 100}%`;
    box.style.top = `${crop.top * 100}%`;
    box.style.right = `${crop.right * 100}%`;
    box.style.bottom = `${crop.bottom * 100}%`;
  }

  private dragCrop(e: PointerEvent, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.cropping) return;
    const startCrop = { ...this.cropping.crop };
    const { full } = this.cropping;
    const x0 = e.clientX;
    const y0 = e.clientY;
    this.follow(e, (ev) => {
      if (!this.cropping) return;
      this.cropping.crop = cropDrag(handle, startCrop, (ev.clientX - x0) / full.w, (ev.clientY - y0) / full.h);
      this.drawCrop();
    }, () => {});
  }

  private endCrop(applyIt: boolean) {
    const c = this.cropping;
    if (!c) return;
    this.cropping = null;
    c.release();
    this.stage?.remove();
    this.dom.querySelector(`.${styles.cropBar}`)?.remove();
    this.stage = null;
    this.dom.classList.remove(styles.croppingMode);
    if (!applyIt) return;
    const { crop, full } = c;
    const same = (Object.keys(crop) as (keyof Crop)[]).every((k) => Math.abs(crop[k] - this.attrs.crop[k]) < 0.001);
    if (same) return;
    // The scale stays as it was: the picture's new width is what's left of the whole one.
    const fw = 1 - crop.left - crop.right;
    const fh = 1 - crop.top - crop.bottom;
    this.commit({
      crop,
      width: full.w * fw,
      height: this.attrs.height ? full.h * fh : null,
    });
  }

  // ── NodeView protocol ─────────────────────────────────────────────────────

  selectNode() { this.dom.classList.add(styles.selected); }
  // Off the picture by keyboard: apply the crop, after ProseMirror finishes this update.
  deselectNode() { this.dom.classList.remove(styles.selected); if (this.cropping) queueMicrotask(() => this.endCrop(true)); }

  update(node: PMNode) {
    if (node.type.name !== 'image') return false;
    if (this.cropping) this.endCrop(false);
    this.apply(node);
    return true;
  }

  // Handles, the bar and the crop stage are ours: ProseMirror mustn't start a selection or a
  // drag from them.
  stopEvent(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (!!t.closest(`.${styles.handles}`) || !!t.closest(`.${styles.bar}`) || !!t.closest(`.${styles.stage}`));
  }

  ignoreMutation() { return true; }

  destroy() {
    this.drag?.();
    this.cropping?.release();
  }
}

function el(tag: string, className: string) {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function button(label: string, onClick: () => void, title?: string) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = styles.barBtn;
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return b;
}
