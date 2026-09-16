import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

export interface KebabItem {
  icon?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}

interface Props {
  items: KebabItem[];
  title?: string;
  className?: string;
  align?: 'left' | 'right';
}

export default function KebabMenu({ items, title, className = '', align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      align === 'right'
        ? { top: r.bottom + 6, right: window.innerWidth - r.right }
        : { top: r.bottom + 6, left: r.left },
    );
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (!visible.length) return null;

  const toggle = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!open) place();
    setOpen((o) => !o);
  };

  return (
    <div className={`kebab ${open ? 'open' : ''} ${className}`} ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="kebab-trigger"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
      >
        ⋮
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="kebab-panel"
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((it, i) => (
              <button
                key={i}
                type="button"
                className={`kebab-item ${it.danger ? 'danger' : ''}`}
                role="menuitem"
                disabled={it.disabled}
                title={it.title}
                onClick={(e) => {
                  e.stopPropagation();
                  it.onClick();
                  setOpen(false);
                }}
              >
                {it.icon && <span className="kebab-ico">{it.icon}</span>}
                <span className="kebab-txt">{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
