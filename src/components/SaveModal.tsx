import { useEffect, useMemo, useState } from 'react';
import type { Collection, Folder } from '../types/request';

interface Props {
  defaultName: string;
  collections: Collection[];
  defaultCollectionId?: string | null;
  defaultFolderId?: string | null;
  onCreateCollection: (name: string) => void;
  onSave: (collectionId: string, folderId: string | null, name: string) => void;
  onClose: () => void;
}

function folderOptions(collection: Collection): { id: string | null; label: string }[] {
  const out: { id: string | null; label: string }[] = [{ id: null, label: '(gốc collection)' }];
  const walk = (folders: Folder[], prefix: string) => {
    for (const f of folders) {
      out.push({ id: f.id, label: `${prefix}${f.name}` });
      walk(f.folders, `${prefix}${f.name} / `);
    }
  };
  walk(collection.folders, '');
  return out;
}

export default function SaveModal({
  defaultName,
  collections,
  defaultCollectionId,
  defaultFolderId,
  onCreateCollection,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(defaultName || 'Request mới');
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? collections[0]?.id ?? '');
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId ?? null);

  useEffect(() => {
    const stillExists = collections.some((c) => c.id === collectionId);
    if (!stillExists && collections.length) {
      setCollectionId(collections[collections.length - 1].id);
    }
  }, [collections, collectionId]);

  const currentCollection = collections.find((c) => c.id === collectionId) ?? null;
  const folders = useMemo(
    () => (currentCollection ? folderOptions(currentCollection) : []),
    [currentCollection],
  );

  useEffect(() => {
    if (folderId && !folders.some((f) => f.id === folderId)) setFolderId(null);
  }, [folders, folderId]);

  const create = () => {
    onCreateCollection(`Collection ${collections.length + 1}`);
  };

  const save = () => {
    if (!collectionId) return;
    onSave(collectionId, folderId, name.trim() || 'Request mới');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Lưu request</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="field-label">Tên request</label>
          <input
            className="field"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />

          <label className="field-label">Collection</label>
          {collections.length === 0 ? (
            <p className="side-empty">
              Chưa có collection nào.{' '}
              <button className="link-btn" onClick={create}>
                Tạo collection
              </button>
            </p>
          ) : (
            <div className="row-gap">
              <select
                className="field"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="ghost-btn" onClick={create}>
                + Mới
              </button>
            </div>
          )}

          {currentCollection && folders.length > 1 && (
            <>
              <label className="field-label">Thư mục</label>
              <select
                className="field"
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
              >
                {folders.map((f) => (
                  <option key={f.id ?? 'root'} value={f.id ?? ''}>
                    {f.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={onClose}>
            Hủy
          </button>
          <button className="send-btn" onClick={save} disabled={!collectionId}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
