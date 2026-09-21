import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LABELS } from '@/config/labels';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useDialogStore, type DialogRequest } from '@/store/dialogStore';
import styles from './ConfirmDialog.module.css';

function Dialog({ request }: { request: DialogRequest }) {
  const settle    = useDialogStore((s) => s.settle);
  const focusRef  = useRef<HTMLButtonElement>(null);
  const isAlert   = request.kind === 'alert';
  const cancel    = () => settle(request.id, false);
  const confirm   = () => settle(request.id, true);
  const confirmRef = useRef(confirm);
  useEffect(() => { confirmRef.current = confirm; });

  // Registered last, so it is the top of the Escape stack and closes before whatever it opened over.
  useEscapeClose(isAlert ? confirm : cancel);

  // With a focus delay the dialog is up but inert (focus stays where the user was typing, and
  // Ctrl+Enter is ignored) until the delay ends; then, unless the reason for asking has gone away
  // (isStale), it takes focus like any other dialog.
  const armedRef = useRef(request.focusDelayMs === 0);
  // A destructive prompt lands on Cancel so a reflexive Enter can't confirm it.
  useEffect(() => {
    if (request.focusDelayMs === 0) { focusRef.current?.focus(); return; }
    const timer = setTimeout(() => {
      if (request.isStale?.()) { settle(request.id, false); return; }
      armedRef.current = true;
      focusRef.current?.focus();
    }, request.focusDelayMs);
    return () => clearTimeout(timer);
  }, [request, settle]);

  // Capture phase + stopImmediatePropagation: the modal underneath may have its own Ctrl+Enter
  // (submit) listener, and this dialog must be the only one that answers.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && armedRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        confirmRef.current();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) (isAlert ? confirm : cancel)(); }}
      // Keeps App's single-key hotkeys (Space = new item, digits = switch section…) from firing
      // behind the dialog while a button has focus.
      onKeyDown={(e) => { if (e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
    >
      <div
        className={styles.modal}
        role={request.destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className={styles.title}>{request.title}</h2>
        {request.itemName && <p className={styles.itemName}>{request.itemName}</p>}
        {(request.irreversible || request.message) && (
          <p className={request.irreversible ? styles.warning : styles.message}>
            {request.irreversible && <strong>{LABELS.itemActions.deleteWarning} </strong>}
            {request.message}
          </p>
        )}
        <div className={styles.actions}>
          {!isAlert && (
            <button
              ref={request.destructive ? focusRef : undefined}
              type="button"
              className={styles.cancelBtn}
              onClick={cancel}
            >
              {request.cancelLabel}
            </button>
          )}
          <button
            ref={request.destructive ? undefined : focusRef}
            type="button"
            className={request.destructive ? styles.dangerBtn : styles.primaryBtn}
            onClick={confirm}
          >
            {request.confirmLabel} <span className={styles.kbd}>Ctrl+Enter</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialogHost() {
  const request = useDialogStore((s) => s.queue[0]);
  return request ? <Dialog key={request.id} request={request} /> : null;
}
