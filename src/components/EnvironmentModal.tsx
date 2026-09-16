import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Environment, KeyValue } from '../types/request';
import KeyValueEditor, { newRow } from './KeyValueEditor';
import DotenvModal, { type DotenvTarget } from './DotenvModal';
import { useDialogs } from '../hooks/useDialogs';

interface Props {
  environments: Environment[];
  globals: KeyValue[];
  activeEnvId: string | null;
  onAdd: (name: string) => void;
  onUpdate: (id: string, patch: Partial<Environment>) => void;
  onDelete: (id: string) => void;
  onUpdateGlobals: (variables: KeyValue[]) => void;
  onExportEnv: (id: string) => void;
  onImportEnv: (file: File) => void;
  onImportDotenv: (pairs: { key: string; value: string }[], target: DotenvTarget) => void;
  onClose: () => void;
}

const GLOBALS = '__globals__';

export default function EnvironmentModal({
  environments,
  globals,
  activeEnvId,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateGlobals,
  onExportEnv,
  onImportEnv,
  onImportDotenv,
  onClose,
}: Props) {
  const { confirm } = useDialogs();
  const [dotenvOpen, setDotenvOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(
    activeEnvId ?? environments[0]?.id ?? null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId === GLOBALS) return;
    const exists = environments.some((e) => e.id === editingId);
    if (!exists) setEditingId(activeEnvId ?? environments[environments.length - 1]?.id ?? null);
  }, [environments, editingId, activeEnvId]);

  const editing = environments.find((e) => e.id === editingId) ?? null;

  const promptNew = () => {
    onAdd(`Environment ${environments.length + 1}`);
  };

  return (
    <>
      {createPortal(
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Environments</h3>
              <button className="modal-x" onClick={onClose}>
                ×
              </button>
            </div>
            <div className="modal-body env-modal">
              <div className="env-list">
                <button className="env-add" onClick={promptNew}>
                  + Environment
                </button>
                <button className="env-add" onClick={() => fileRef.current?.click()}>
                  ↧ Import environment
                </button>
                <button className="env-add" onClick={() => setDotenvOpen(true)}>
                  ↧ Import .env
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportEnv(f);
                    e.target.value = '';
                  }}
                />
                <div
                  className={`env-item ${editingId === GLOBALS ? 'active' : ''}`}
                  onClick={() => setEditingId(GLOBALS)}
                >
                  <span>🌐 Globals</span>
                </div>
                {environments.map((e) => (
                  <div
                    key={e.id}
                    className={`env-item ${e.id === editingId ? 'active' : ''}`}
                    onClick={() => setEditingId(e.id)}
                  >
                    <span>{e.name}</span>
                    <button
                      className="row-del"
                      onClick={async (ev) => {
                        ev.stopPropagation();
                        if (
                          await confirm({
                            title: 'Xóa environment',
                            message: `Xóa "${e.name}"?`,
                            danger: true,
                          })
                        ) {
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
                {editingId === GLOBALS ? (
                  <>
                    <div className="env-detail-head">
                      <span className="env-name-input as-title">🌐 Biến toàn cục</span>
                    </div>
                    <p className="env-var-hint">
                      Biến toàn cục áp dụng cho mọi environment (ưu tiên thấp hơn biến của
                      environment đang chọn).
                    </p>
                    <KeyValueEditor
                      items={globals.length ? globals : [newRow()]}
                      onChange={onUpdateGlobals}
                      keyPlaceholder="Biến"
                      allowSecret
                    />
                  </>
                ) : editing ? (
                  <>
                    <div className="env-detail-head">
                      <input
                        className="env-name-input"
                        value={editing.name}
                        onChange={(e) => onUpdate(editing.id, { name: e.target.value })}
                      />
                      <button
                        className="ghost-btn sm"
                        onClick={() => onExportEnv(editing.id)}
                        title="Export environment này ra file JSON"
                      >
                        ↥ Export
                      </button>
                    </div>
                    <p className="env-var-hint">
                      Dùng biến trong request bằng cú pháp <code>{'{{tên}}'}</code>. Biến bí mật
                      được che và không kèm giá trị khi export.
                    </p>
                    <KeyValueEditor
                      items={editing.variables.length ? editing.variables : [newRow()]}
                      onChange={(variables: KeyValue[]) => onUpdate(editing.id, { variables })}
                      keyPlaceholder="Biến"
                      allowSecret
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

      {dotenvOpen && (
        <DotenvModal
          environments={environments}
          defaultEnvId={editingId && editingId !== GLOBALS ? editingId : activeEnvId}
          onImport={onImportDotenv}
          onClose={() => setDotenvOpen(false)}
        />
      )}
    </>
  );
}
