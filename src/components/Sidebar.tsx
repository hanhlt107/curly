import { useMemo, useState } from 'react';
import type { Collection, Folder, HistoryEntry, SavedRequest } from '../types/request';
import { countRequests, folderContains, moveTargets } from '../config/collections';
import { useDialogs } from '../hooks/useDialogs';

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

function encodeTarget(collectionId: string, folderId: string | null): string {
  return `${collectionId}::${folderId ?? ''}`;
}

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
  const { confirm, prompt } = useDialogs();
  const [view, setView] = useState<'collections' | 'history'>('collections');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusClass>('all');

  const targets = useMemo(() => moveTargets(collections), [collections]);

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

  const moveSelect = (
    title: string,
    onPick: (toCollectionId: string, toFolderId: string | null) => void,
    exclude?: (t: { collectionId: string; folderId: string | null }) => boolean,
  ) => (
    <select
      className="tree-move"
      title={title}
      value=""
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (!e.target.value) return;
        const [cid, fid] = e.target.value.split('::');
        onPick(cid, fid || null);
      }}
    >
      <option value="">⇄</option>
      {targets
        .filter((t) => !exclude || !exclude(t))
        .map((t) => (
          <option
            key={encodeTarget(t.collectionId, t.folderId)}
            value={encodeTarget(t.collectionId, t.folderId)}
          >
            → {t.label}
          </option>
        ))}
    </select>
  );

  const renderRequest = (collectionId: string, r: SavedRequest, depth: number) => (
    <li
      key={r.id}
      className="tree-req"
      style={{ paddingLeft: 10 + depth * 12 }}
      onClick={() => onOpenSaved(r)}
    >
      <span className={`m-tag m-${r.request.method}`}>{METHOD_SHORT[r.request.method]}</span>
      <span className="tree-req-name" title={r.name}>
        {r.name}
      </span>
      <button
        className="row-run"
        title="Nhân bản request"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicateSaved(collectionId, r.id);
        }}
      >
        ⧉
      </button>
      {moveSelect('Chuyển request sang collection / thư mục khác', (cid, fid) =>
        onMoveSavedTo(collectionId, r.id, cid, fid),
      )}
      <button
        className="row-del"
        title="Xóa request"
        onClick={async (e) => {
          e.stopPropagation();
          if (
            await confirm({
              title: 'Xóa request',
              message: `Xóa request "${r.name}"?`,
              danger: true,
            })
          )
            onDeleteSaved(collectionId, r.id);
        }}
      >
        ×
      </button>
    </li>
  );

  const renderFolder = (collectionId: string, f: Folder, depth: number) => {
    const isEmpty = f.requests.length === 0 && f.folders.length === 0;
    return (
      <li key={f.id} className="tree-folder">
        <div
          className="tree-folder-head"
          style={{ paddingLeft: 8 + depth * 12 }}
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
          <button
            className="row-run"
            title="Tạo thư mục con"
            onClick={async (e) => {
              e.stopPropagation();
              const name = await prompt({
                title: 'Tạo thư mục con',
                message: 'Tên thư mục con:',
                placeholder: 'Tên thư mục con',
              });
              if (name) {
                onAddFolder(collectionId, f.id, name);
                setExpanded((p) => ({ ...p, [f.id]: true }));
              }
            }}
          >
            ＋
          </button>
          {moveSelect(
            'Chuyển thư mục',
            (cid, fid) => onMoveFolderTo(collectionId, f.id, cid, fid),
            (t) =>
              (t.collectionId === collectionId && t.folderId === f.id) ||
              (t.collectionId === collectionId &&
                t.folderId != null &&
                folderContains(f, t.folderId)),
          )}
          <button
            className="row-del"
            title="Xóa thư mục (và nội dung bên trong)"
            onClick={async (e) => {
              e.stopPropagation();
              if (
                await confirm({
                  title: 'Xóa thư mục',
                  message: `Xóa thư mục "${f.name}" và toàn bộ nội dung?`,
                  danger: true,
                })
              )
                onDeleteFolder(collectionId, f.id);
            }}
          >
            ×
          </button>
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
                  <button
                    className="row-run"
                    title="Tạo thư mục"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const name = await prompt({
                        title: 'Tạo thư mục',
                        message: 'Tên thư mục:',
                        placeholder: 'Tên thư mục',
                      });
                      if (name) {
                        onAddFolder(c.id, null, name);
                        setExpanded((p) => ({ ...p, [c.id]: true }));
                      }
                    }}
                  >
                    🗂
                  </button>
                  {countRequests(c) > 0 && (
                    <button
                      className="row-run"
                      title="Chạy cả collection"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunCollection(c.id);
                      }}
                    >
                      ▶
                    </button>
                  )}
                  {countRequests(c) > 0 && (
                    <button
                      className="row-run"
                      title="Xem / xuất tài liệu collection"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDocsCollection(c.id);
                      }}
                    >
                      📄
                    </button>
                  )}
                  {countRequests(c) > 0 && (
                    <button
                      className="row-run"
                      title="Export ra Postman collection"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportCollection(c.id);
                      }}
                    >
                      ↥
                    </button>
                  )}
                  <button
                    className="row-del"
                    title="Xóa collection"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (
                        await confirm({
                          title: 'Xóa collection',
                          message: `Xóa collection "${c.name}"?`,
                          danger: true,
                        })
                      )
                        onDeleteCollection(c.id);
                    }}
                  >
                    ×
                  </button>
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
