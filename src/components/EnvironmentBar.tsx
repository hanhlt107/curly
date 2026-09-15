import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Environment, KeyValue } from '../types/request';
import KeyValueEditor, { newRow } from './KeyValueEditor';

interface Props {
  environments: Environment[];
  activeEnvId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (name: string) => void;
  onUpdate: (id: string, patch: Partial<Environment>) => void;
  onDelete: (id: string) => void;
}

export default function EnvironmentBar({
  environments,
  activeEnvId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(activeEnvId);

  useEffect(() => {
    if (!open) return;
    const exists = environments.some((e) => e.id === editingId);
    if (!exists) setEditingId(activeEnvId ?? environments[environments.length - 1]?.id ?? null);
  }, [open, environments, editingId, activeEnvId]);

  const editing = environments.find((e) => e.id === editingId) ?? null;

  const openModal = () => {
    setEditingId(activeEnvId ?? environments[0]?.id ?? null);
    setOpen(true);
  };

  const promptNew = () => {
    onAdd(`Environment ${environments.length + 1}`);
  };

  return (
    <>
      <div className="env-bar">
        <span className="env-icon">◈</span>
        <select
          className="env-select"
          value={activeEnvId ?? ''}
          onChange={(e) => onSelect(e.target.value || null)}
        >
          <option value="">No Environment</option>
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button className="env-gear" onClick={openModal} title="Quản lý environment">
          ⚙
        </button>
      </div>

      {open &&
        createPortal(
          <div className="modal-overlay" onClick={() => setOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>Environments</h3>
                <button className="modal-x" onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body env-modal">
                <div className="env-list">
                  <button className="env-add" onClick={promptNew}>
                    + Environment
                  </button>
                  {environments.map((e) => (
                    <div
                      key={e.id}
                      className={`env-item ${e.id === editingId ? 'active' : ''}`}
                      onClick={() => setEditingId(e.id)}
                    >
                      <span>{e.name}</span>
                      <button
                        className="row-del"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (window.confirm(`Xóa "${e.name}"?`)) {
                            onDelete(e.id);
                            if (editingId === e.id) setEditingId(null);
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="env-detail">
                  {editing ? (
                    <>
                      <input
                        className="env-name-input"
                        value={editing.name}
                        onChange={(e) => onUpdate(editing.id, { name: e.target.value })}
                      />
                      <p className="env-var-hint">
                        Dùng biến trong request bằng cú pháp <code>{'{{tên}}'}</code>
                      </p>
                      <KeyValueEditor
                        items={editing.variables.length ? editing.variables : [newRow()]}
                        onChange={(variables: KeyValue[]) => onUpdate(editing.id, { variables })}
                        keyPlaceholder="Biến"
                      />
                    </>
                  ) : (
                    <p className="side-empty">Chọn hoặc tạo một environment để sửa biến.</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
