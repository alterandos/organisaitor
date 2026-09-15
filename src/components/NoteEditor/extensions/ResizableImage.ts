import Image from '@tiptap/extension-image';

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
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrap = document.createElement('span');
      wrap.style.cssText = 'display: block; position: relative; margin: 0.75rem 0;';

      const img = document.createElement('img');
      img.style.cssText = 'display: block; max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);';
      img.src = node.attrs.src as string;
      if (node.attrs.alt) img.alt = node.attrs.alt as string;
      if (node.attrs.title) img.title = node.attrs.title as string;
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`;
      wrap.appendChild(img);

      const handle = document.createElement('span');
      handle.style.cssText = [
        'position:absolute', 'bottom:6px', 'right:6px',
        'width:12px', 'height:12px',
        'background:var(--color-primary)',
        'border:2px solid white',
        'border-radius:3px',
        'cursor:se-resize',
        'opacity:0',
        'transition:opacity 0.15s',
        'z-index:10',
      ].join(';');
      wrap.appendChild(handle);

      let selected = false;

      wrap.addEventListener('mouseenter', () => { handle.style.opacity = '1'; });
      wrap.addEventListener('mouseleave', () => { if (!selected) handle.style.opacity = '0'; });

      // ── Resize drag ────────────────────────────────────────────────────────
      let startX = 0;
      let startW = 0;

      const onMove = (e: MouseEvent) => {
        const newW = Math.max(60, Math.round(startW + e.clientX - startX));
        img.style.width = `${newW}px`;
      };

      const onUp = (e: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const newW = Math.max(60, Math.round(startW + e.clientX - startX));
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos != null) {
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: newW })
          );
        }
      };

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = img.getBoundingClientRect().width || (node.attrs.width as number) || 400;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      return {
        dom: wrap,

        selectNode() {
          selected = true;
          img.style.outline = '2px solid var(--color-primary)';
          img.style.outlineOffset = '2px';
          handle.style.opacity = '1';
        },

        deselectNode() {
          selected = false;
          img.style.outline = '';
          img.style.outlineOffset = '';
          handle.style.opacity = '0';
        },

        update(updatedNode) {
          if (updatedNode.type.name !== 'image') return false;
          img.src = updatedNode.attrs.src as string;
          if (updatedNode.attrs.alt) img.alt = updatedNode.attrs.alt as string;
          img.style.width = updatedNode.attrs.width ? `${updatedNode.attrs.width}px` : '';
          return true;
        },

        destroy() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        },
      };
    };
  },
});
