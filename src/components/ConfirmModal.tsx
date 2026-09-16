import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ConfirmOptions } from '../hooks/useDialogs';

interface Props {
  options: ConfirmOptions;
  onResolve: (value: boolean) => void;
}

export default function ConfirmModal({ options, onResolve }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onResolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve]);

  const danger = options.danger;

  return createPortal(
    <div className="modal-overlay" onClick={() => onResolve(false)}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{options.title ?? 'Xác nhận'}</h3>
          <button className="modal-x" onClick={() => onResolve(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="dialog-msg">{options.message}</p>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={() => onResolve(false)}>
            {options.cancelLabel ?? 'Hủy'}
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'send-btn danger-btn' : 'send-btn'}
            onClick={() => onResolve(true)}
          >
            {options.confirmLabel ?? (danger ? 'Xóa' : 'OK')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
