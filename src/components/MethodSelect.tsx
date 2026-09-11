import { useEffect, useRef, useState } from 'react';
import type { HttpMethod } from '../types/request';

interface Props {
  methods: HttpMethod[];
  value: HttpMethod;
  onChange: (m: HttpMethod) => void;
}

export default function MethodSelect({ methods, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (m: HttpMethod) => {
    onChange(m);
    setOpen(false);
  };

  return (
    <div className={`method-select ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className={`method-trigger m-${value}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value}</span>
        <span className="method-caret">▾</span>
      </button>
      {open && (
        <ul className="method-menu" role="listbox">
          {methods.map((m) => (
            <li
              key={m}
              role="option"
              aria-selected={m === value}
              className={`method-option m-${m} ${m === value ? 'sel' : ''}`}
              onClick={() => pick(m)}
            >
              <span>{m}</span>
              {m === value && <span className="method-check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
