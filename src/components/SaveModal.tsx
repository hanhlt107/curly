import { useState } from 'react';
import type { Collection } from '../types/request';

interface Props {
  defaultName: string;
  collections: Collection[];
  onCreateCollection: (name: string) => void;
  onSave: (collectionId: string, name: string) => void;
  onClose: () => void;
}

export default function SaveModal({
  defaultName,
  collections,
  onCreateCollection,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(defaultName || 'Request mới');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');

  const create = () => {
    const cn = window.prompt('Tên collection mới:');
    if (cn) onCreateCollection(cn);
  };

  const save = () => {
    if (!collectionId) return;
    onSave(collectionId, name.trim() || 'Request mới');
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
