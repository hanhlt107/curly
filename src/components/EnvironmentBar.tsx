import { useEffect, useRef, useState } from 'react';
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(activeEnvId);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const exists = environments.some((e) => e.id === editingId);
    if (!exists) setEditingId(activeEnvId ?? environments[environments.length - 1]?.id ?? null);
  }, [open, environments, editingId, activeEnvId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const activeName = environments.find((e) => e.id === activeEnvId)?.name ?? 'No Environment';

  const pick = (id: string | null) => {
    onSelect(id);
    setPickerOpen(false);
  };

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
        <div className={`env-picker ${pickerOpen ? 'open' : ''}`} ref={pickerRef}>
          <button
            type="button"
            className="env-trigger"
            onClick={() => setPickerOpen((o) => !o)}
          >
            <span className="env-trigger-name">{activeName}</span>
            <span className="env-caret">▼</span>
          </button>
          {pickerOpen && (
            <ul className="env-menu" role="listbox">
              <li
                role="option"
                aria-selected={activeEnvId == null}
                className={`env-option ${activeEnvId == null ? 'sel' : ''}`}
                onClick={() => pick(null)}
              >
                <span>No Environment</span>
                {activeEnvId == null && <span className="env-check">✓</span>}
              </li>
              {environments.map((e) => (
                <li
                  key={e.id}
                  role="option"
                  aria-selected={e.id === activeEnvId}
                  className={`env-option ${e.id === activeEnvId ? 'sel' : ''}`}
                  onClick={() => pick(e.id)}
                >
                  <span>{e.name}</span>
                  {e.id === activeEnvId && <span className="env-check">✓</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
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
