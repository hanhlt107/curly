import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
  method?: string;
  url?: string;
  path?: string;
  haystack?: string;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.haystack ?? ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmd-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (i: number) => {
    const cmd = filtered[i];
    if (cmd) {
      cmd.run();
      onClose();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return createPortal(
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="cmd-input"
          autoFocus
          placeholder="Tìm request (tên, URL, header, param, body), environment, hoặc lệnh…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && <div className="cmd-empty">Không có kết quả</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-item ${c.method ? 'gs-item' : ''} ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {c.method ? (
                <>
                  <span className="gs-method">{c.method}</span>
                  <span className="gs-main">
                    <span className="cmd-label">{c.label}</span>
                    {c.url && <span className="gs-url">{c.url}</span>}
                  </span>
                  {c.path && <span className="gs-path">{c.path}</span>}
                </>
              ) : (
                <>
                  <span className="cmd-group">{c.group}</span>
                  <span className="cmd-label">{c.label}</span>
                  {c.hint && <span className="cmd-hint">{c.hint}</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
