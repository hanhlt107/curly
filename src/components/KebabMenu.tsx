import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

interface Pos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
}

const MARGIN = 8;
const GAP = 6;

export default function KebabMenu({ items, title, className = '', align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const horiz = align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left };
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    const needed = panelRef.current?.scrollHeight ?? 0;
    const openUp = spaceBelow < Math.min(needed, 260) && spaceAbove > spaceBelow;
    if (openUp) {
      setPos({ bottom: window.innerHeight - r.top + GAP, maxHeight: spaceAbove, ...horiz });
    } else {
      setPos({ top: r.bottom + GAP, maxHeight: spaceBelow, ...horiz });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

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
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
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
        createPortal(
          <div
            ref={panelRef}
            className="kebab-panel"
            role="menu"
            style={{
              position: 'fixed',
              top: pos?.top,
              bottom: pos?.bottom,
              left: pos?.left,
              right: pos?.right,
              maxHeight: pos?.maxHeight,
              visibility: pos ? 'visible' : 'hidden',
            }}
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
