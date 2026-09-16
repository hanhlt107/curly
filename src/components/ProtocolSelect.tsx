import { useEffect, useRef, useState } from 'react';
import type { Protocol } from '../types/request';

interface Props {
  protocols: { value: Protocol; label: string }[];
  value: Protocol;
  onChange: (p: Protocol) => void;
}

export default function ProtocolSelect({ protocols, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = protocols.find((p) => p.value === value) ?? protocols[0];

  const pick = (p: Protocol) => {
    onChange(p);
    setOpen(false);
  };

  return (
    <div className={`proto-select ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="proto-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Giao thức"
      >
        <span>{active.label}</span>
        <span className="proto-caret">▾</span>
      </button>
      {open && (
        <ul className="proto-menu" role="listbox">
          {protocols.map((p) => (
            <li
              key={p.value}
              role="option"
              aria-selected={p.value === value}
              className={`proto-option ${p.value === value ? 'sel' : ''}`}
              onClick={() => pick(p.value)}
            >
              <span>{p.label}</span>
              {p.value === value && <span className="proto-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
