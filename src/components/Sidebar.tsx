import { useState } from 'react';
import type { Collection, HistoryEntry, SavedRequest } from '../types/request';

interface Props {
  collections: Collection[];
  history: HistoryEntry[];
  onOpenSaved: (saved: SavedRequest) => void;
  onOpenHistory: (entry: HistoryEntry) => void;
  onAddCollection: (name: string) => void;
  onDeleteCollection: (id: string) => void;
  onDeleteSaved: (collectionId: string, requestId: string) => void;
  onClearHistory: () => void;
}

const METHOD_SHORT: Record<string, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PAT',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT',
};

export default function Sidebar({
  collections,
  history,
  onOpenSaved,
  onOpenHistory,
  onAddCollection,
  onDeleteCollection,
  onDeleteSaved,
  onClearHistory,
}: Props) {
  const [view, setView] = useState<'collections' | 'history'>('collections');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const promptNew = () => {
    const name = window.prompt('Tên collection mới:');
    if (name !== null) onAddCollection(name);
  };

  return (
    <aside className="sidebar">
      <div className="side-switch">
        <button
          className={view === 'collections' ? 'active' : ''}
          onClick={() => setView('collections')}
        >
          Collections
        </button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
          History
        </button>
      </div>

      {view === 'collections' ? (
        <div className="side-body">
          <div className="side-head">
            <span>{collections.length} collection</span>
            <button className="icon-btn" onClick={promptNew} title="Tạo collection">
              +
            </button>
          </div>
          {collections.length === 0 && (
            <p className="side-empty">Chưa có collection. Bấm + để tạo, rồi Save request vào.</p>
          )}
          <ul className="tree">
            {collections.map((c) => (
              <li key={c.id} className="tree-col">
                <div className="tree-col-head" onClick={() => toggle(c.id)}>
                  <span className={`caret ${expanded[c.id] ? 'open' : ''}`}>▸</span>
                  <span className="tree-name">{c.name}</span>
                  <span className="tree-count">{c.requests.length}</span>
                  <button
                    className="row-del"
                    title="Xóa collection"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Xóa collection "${c.name}"?`)) onDeleteCollection(c.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                {expanded[c.id] && (
                  <ul className="tree-reqs">
                    {c.requests.length === 0 && <li className="tree-empty">(trống)</li>}
                    {c.requests.map((r) => (
                      <li key={r.id} className="tree-req" onClick={() => onOpenSaved(r)}>
                        <span className={`m-tag m-${r.request.method}`}>
                          {METHOD_SHORT[r.request.method]}
                        </span>
                        <span className="tree-req-name" title={r.name}>
                          {r.name}
                        </span>
                        <button
                          className="row-del"
                          title="Xóa request"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSaved(c.id, r.id);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="side-body">
          <div className="side-head">
            <span>{history.length} request</span>
            {history.length > 0 && (
              <button className="icon-btn" onClick={onClearHistory} title="Xóa lịch sử">
                🗑
              </button>
            )}
          </div>
          {history.length === 0 && <p className="side-empty">Chưa có lịch sử.</p>}
          <ul className="tree">
            {history.map((h) => (
              <li key={h.id} className="tree-req flat" onClick={() => onOpenHistory(h)}>
                <span className={`m-tag m-${h.method}`}>{METHOD_SHORT[h.method]}</span>
                <span className="tree-req-name" title={h.url}>
                  {h.url || '(trống)'}
                </span>
                {h.status != null && <span className={`dot s-${statusFamily(h.status)}`} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function statusFamily(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400) return 'err';
  return 'other';
}
