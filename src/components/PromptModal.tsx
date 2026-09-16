import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type { PromptOptions } from '../hooks/useDialogs';

interface Props {
  options: PromptOptions;
  onResolve: (value: string | null) => void;
}

export default function PromptModal({ options, onResolve }: Props) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve]);

  const submit = () => {
    const trimmed = value.trim();
    onResolve(trimmed ? trimmed : null);
  };

  return createPortal(
    <div className="modal-overlay" onClick={() => onResolve(null)}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{options.title ?? 'Nhập'}</h3>
          <button className="modal-x" onClick={() => onResolve(null)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {options.message && <label className="field-label">{options.message}</label>}
          <input
            ref={inputRef}
            className="field"
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="modal-foot">
          <Button onClick={() => onResolve(null)}>Hủy</Button>
          <Button variant="primary" onClick={submit}>
            {options.confirmLabel ?? 'OK'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
