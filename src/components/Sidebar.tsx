import { useState } from 'react';
import type { Collection, Folder, HistoryEntry, SavedRequest } from '../types/request';
import { countRequests, folderContains } from '../config/collections';
import { useDialogs } from '../hooks/useDialogs';
import { MAX_COLLECTIONS } from '../hooks/useStore';
import KebabMenu from './KebabMenu';

type Drag =
  | { type: 'request'; fromCollectionId: string; id: string; label: string }
  | { type: 'folder'; fromCollectionId: string; id: string; label: string; node: Folder };

interface Props {
  collections: Collection[];
  history: HistoryEntry[];
  historyLimit: number;
  onChangeHistoryLimit: (limit: number) => void;
  onOpenSaved: (saved: SavedRequest) => void;
  onOpenHistory: (entry: HistoryEntry) => void;
  onAddCollection: (name: string) => void;
  onRenameCollection: (id: string, name: string) => void;
  onRunCollection: (id: string) => void;
  onDocsCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onDeleteSaved: (collectionId: string, requestId: string) => void;
  onDuplicateSaved: (collectionId: string, requestId: string) => void;
  onMoveSavedTo: (
    fromCollectionId: string,
    requestId: string,
    toCollectionId: string,
    toFolderId: string | null,
  ) => void;
  onMoveFolderTo: (
    fromCollectionId: string,
    folderId: string,
    toCollectionId: string,
    toFolderId: string | null,
  ) => void;
  onAddFolder: (collectionId: string, parentFolderId: string | null, name: string) => void;
  onRenameFolder: (collectionId: string, folderId: string, name: string) => void;
  onDeleteFolder: (collectionId: string, folderId: string) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

function timeAgo(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return 'vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.floor(h / 24);
  return `${d} ngày`;
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

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
type StatusClass = 'all' | '2' | '3' | '4' | '5' | 'err';

export default function Sidebar({
  collections,
  history,
  historyLimit,
  onChangeHistoryLimit,
  onOpenSaved,
  onOpenHistory,
  onAddCollection,
  onRenameCollection,
  onRunCollection,
  onDocsCollection,
  onExportCollection,
  onDeleteCollection,
  onDeleteSaved,
  onDuplicateSaved,
  onMoveSavedTo,
  onMoveFolderTo,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteHistory,
  onClearHistory,
}: Props) {
  const { confirm, prompt, toast } = useDialogs();
  const [view, setView] = useState<'collections' | 'history'>('collections');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusClass>('all');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const canDrop = (toFolderId: string | null): boolean => {
    if (!drag) return false;
    if (drag.type === 'folder') {
      if (toFolderId === drag.id) return false;
      if (toFolderId != null && folderContains(drag.node, toFolderId)) return false;
    }
    return true;
  };

  const doDrop = (toCollectionId: string, toFolderId: string | null) => {
    if (!drag || !canDrop(toFolderId)) {
      setDrag(null);
      setOverId(null);
      return;
    }
    if (drag.type === 'request') {
      onMoveSavedTo(drag.fromCollectionId, drag.id, toCollectionId, toFolderId);
    } else {
      onMoveFolderTo(drag.fromCollectionId, drag.id, toCollectionId, toFolderId);
    }
    setDrag(null);
    setOverId(null);
  };

  const q = historyQuery.trim().toLowerCase();
  const filteredHistory = history.filter((h) => {
    if (q && !h.url.toLowerCase().includes(q) && !h.method.toLowerCase().includes(q)) return false;
    if (methodFilter !== 'all' && h.method !== methodFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'err') {
        if (h.status != null) return false;
      } else if (h.status == null || Math.floor(h.status / 100) !== Number(statusFilter)) {
        return false;
      }
    }
    return true;
  });

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const promptNew = () => {
    if (collections.length >= MAX_COLLECTIONS) {
      toast(`Chỉ được tạo tối đa ${MAX_COLLECTIONS} collection`, 'error');
      return;
    }
    onAddCollection(`Collection ${collections.length + 1}`);
  };

  const renameField = (current: string, onSave: (v: string) => void) => (
    <input
      className="tree-rename"
      defaultValue={current}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v) onSave(v);
        setRenamingId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setRenamingId(null);
      }}
    />
  );

  const renderRequest = (collectionId: string, r: SavedRequest, depth: number) => (
    <li
      key={r.id}
      className={`tree-req ${drag?.type === 'request' && drag.id === r.id ? 'dragging' : ''}`}
      style={{ paddingLeft: 10 + depth * 12 }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        setDrag({ type: 'request', fromCollectionId: collectionId, id: r.id, label: r.name });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', r.name);
      }}
      onDragEnd={() => {
        setDrag(null);
        setOverId(null);
      }}
      onClick={() => onOpenSaved(r)}
    >
      <span className={`m-tag m-${r.request.method}`}>{METHOD_SHORT[r.request.method]}</span>
      <span className="tree-req-name" title={r.name}>
        {r.name}
      </span>
      <KebabMenu
        className="row-kebab"
        title="Tùy chọn request"
        items={[
          {
            icon: '⧉',
            label: 'Nhân bản request',
            onClick: () => onDuplicateSaved(collectionId, r.id),
          },
          {
            icon: '×',
            label: 'Xóa request',
            danger: true,
            onClick: () =>
              void (async () => {
                if (
                  await confirm({
                    title: 'Xóa request',
                    message: `Xóa request "${r.name}"?`,
                    danger: true,
                  })
                )
                  onDeleteSaved(collectionId, r.id);
              })(),
          },
        ]}
      />
    </li>
  );

  const renderFolder = (collectionId: string, f: Folder, depth: number) => {
    const isEmpty = f.requests.length === 0 && f.folders.length === 0;
    const folKey = `fol:${collectionId}:${f.id}`;
    return (
      <li key={f.id} className="tree-folder">
        <div
          className={`tree-folder-head ${overId === folKey ? 'drop-over' : ''} ${
            drag?.type === 'folder' && drag.id === f.id ? 'dragging' : ''
          }`}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable={renamingId !== f.id}
          onDragStart={(e) => {
            e.stopPropagation();
            setDrag({
              type: 'folder',
              fromCollectionId: collectionId,
              id: f.id,
              label: f.name,
              node: f,
            });
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', f.name);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            if (!canDrop(f.id)) return;
            e.preventDefault();
            e.stopPropagation();
            setOverId(folKey);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            setOverId((o) => (o === folKey ? null : o));
          }}
          onDrop={(e) => {
            if (!canDrop(f.id)) return;
            e.preventDefault();
            e.stopPropagation();
            doDrop(collectionId, f.id);
          }}
          onClick={() => toggle(f.id)}
        >
          <span className={`caret ${expanded[f.id] ? 'open' : ''}`}>▸</span>
          <span className="folder-ico">🗂</span>
          {renamingId === f.id ? (
            renameField(f.name, (v) => onRenameFolder(collectionId, f.id, v))
          ) : (
            <span
              className="tree-name"
              title="Nhấn đúp để đổi tên"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenamingId(f.id);
              }}
            >
              {f.name}
            </span>
          )}
          <span className="tree-count">{countRequests(f)}</span>
          <KebabMenu
            className="row-kebab"
            title="Tùy chọn thư mục"
            items={[
              {
                icon: '＋',
                label: 'Tạo thư mục con',
                onClick: () =>
                  void (async () => {
                    const name = await prompt({
                      title: 'Tạo thư mục con',
                      message: 'Tên thư mục con:',
                      placeholder: 'Tên thư mục con',
                    });
                    if (name) {
                      onAddFolder(collectionId, f.id, name);
                      setExpanded((p) => ({ ...p, [f.id]: true }));
                    }
                  })(),
              },
              {
                icon: '×',
                label: 'Xóa thư mục',
                danger: true,
                onClick: () =>
                  void (async () => {
                    if (
                      await confirm({
                        title: 'Xóa thư mục',
                        message: `Xóa thư mục "${f.name}" và toàn bộ nội dung?`,
                        danger: true,
                      })
                    )
                      onDeleteFolder(collectionId, f.id);
                  })(),
              },
            ]}
          />
        </div>
        {expanded[f.id] && (
          <ul className="tree-reqs">
            {isEmpty && <li className="tree-empty">(trống)</li>}
            {f.folders.map((sub) => renderFolder(collectionId, sub, depth + 1))}
            {f.requests.map((r) => renderRequest(collectionId, r, depth + 1))}
          </ul>
        )}
      </li>
    );
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
            <span>
              {collections.length}/{MAX_COLLECTIONS} collection
            </span>
            <button
              className="icon-btn"
              onClick={promptNew}
              title={
                collections.length >= MAX_COLLECTIONS
                  ? `Tối đa ${MAX_COLLECTIONS} collection`
                  : 'Tạo collection'
              }
            >
              +
            </button>
          </div>
          {collections.length === 0 && (
            <p className="side-empty">Chưa có collection. Bấm + để tạo, rồi Save request vào.</p>
          )}
          <ul className="tree">
            {collections.map((c) => (
              <li key={c.id} className="tree-col">
                <div
                  className={`tree-col-head ${overId === `col:${c.id}` ? 'drop-over' : ''}`}
                  onDragOver={(e) => {
                    if (!canDrop(null)) return;
                    e.preventDefault();
                    setOverId(`col:${c.id}`);
                  }}
                  onDragLeave={() => setOverId((o) => (o === `col:${c.id}` ? null : o))}
                  onDrop={(e) => {
                    if (!canDrop(null)) return;
                    e.preventDefault();
                    doDrop(c.id, null);
                  }}
                  onClick={() => toggle(c.id)}
                >
                  <span className={`caret ${expanded[c.id] ? 'open' : ''}`}>▸</span>
                  {renamingId === c.id ? (
                    renameField(c.name, (v) => onRenameCollection(c.id, v))
                  ) : (
                    <span
                      className="tree-name"
                      title="Nhấn đúp để đổi tên"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(c.id);
                      }}
                    >
                      {c.name}
                    </span>
                  )}
                  <span className="tree-count">{countRequests(c)}</span>
                  <KebabMenu
                    className="row-kebab"
                    title="Tùy chọn collection"
                    items={[
                      {
                        icon: '🗂',
                        label: 'Tạo thư mục',
                        onClick: () =>
                          void (async () => {
                            const name = await prompt({
                              title: 'Tạo thư mục',
                              message: 'Tên thư mục:',
                              placeholder: 'Tên thư mục',
                            });
                            if (name) {
                              onAddFolder(c.id, null, name);
                              setExpanded((p) => ({ ...p, [c.id]: true }));
                            }
                          })(),
                      },
                      ...(countRequests(c) > 0
                        ? [
                            {
                              icon: '▶',
                              label: 'Chạy cả collection',
                              onClick: () => onRunCollection(c.id),
                            },
                            {
                              icon: '📄',
                              label: 'Xem / xuất tài liệu',
                              onClick: () => onDocsCollection(c.id),
                            },
                            {
                              icon: '↥',
                              label: 'Export ra Postman',
                              onClick: () => onExportCollection(c.id),
                            },
                          ]
                        : []),
                      {
                        icon: '×',
                        label: 'Xóa collection',
                        danger: true,
                        onClick: () =>
                          void (async () => {
                            if (
                              await confirm({
                                title: 'Xóa collection',
                                message: `Xóa collection "${c.name}"?`,
                                danger: true,
                              })
                            )
                              onDeleteCollection(c.id);
                          })(),
                      },
                    ]}
                  />
                </div>
                {expanded[c.id] && (
                  <ul className="tree-reqs">
                    {c.requests.length === 0 && c.folders.length === 0 && (
                      <li className="tree-empty">(trống)</li>
                    )}
                    {c.folders.map((f) => renderFolder(c.id, f, 0))}
                    {c.requests.map((r) => renderRequest(c.id, r, 0))}
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
          <div className="history-limit">
            <label>
              Giới hạn lưu
              <input
                type="number"
                min={1}
                max={1000}
                value={historyLimit}
                onChange={(e) => onChangeHistoryLimit(Number(e.target.value) || 1)}
              />
            </label>
          </div>
          {history.length > 0 && (
            <>
              <input
                className="history-search"
                placeholder="Lọc theo URL / method…"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
              />
              <div className="history-filters">
                <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                  <option value="all">Mọi method</option>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusClass)}
                >
                  <option value="all">Mọi status</option>
                  <option value="2">2xx</option>
                  <option value="3">3xx</option>
                  <option value="4">4xx</option>
                  <option value="5">5xx</option>
                  <option value="err">Lỗi</option>
                </select>
              </div>
            </>
          )}
          {history.length === 0 && <p className="side-empty">Chưa có lịch sử.</p>}
          {history.length > 0 && filteredHistory.length === 0 && (
            <p className="side-empty">Không có kết quả khớp.</p>
          )}
          <ul className="tree">
            {filteredHistory.map((h) => (
              <li key={h.id} className="tree-req flat hist-row" onClick={() => onOpenHistory(h)}>
                <span className={`m-tag m-${h.method}`}>{METHOD_SHORT[h.method]}</span>
                <span className="tree-req-name" title={h.url}>
                  {h.url || '(trống)'}
                </span>
                <span className="hist-meta">
                  {h.status != null && (
                    <span className={`h-status ${statusFamily(h.status)}`}>{h.status}</span>
                  )}
                  <span className="hist-time">{timeAgo(h.at)}</span>
                </span>
                <button
                  className="row-del"
                  title="Xóa khỏi lịch sử"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteHistory(h.id);
                  }}
                >
                  ×
                </button>
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
