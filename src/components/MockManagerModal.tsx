import { createPortal } from 'react-dom';
import Button from './Button';
import KeyValueEditor from './KeyValueEditor';
import type { KeyValue, MockMethod, MockRule } from '../types/request';
import { newMock } from '../config/mocks';

const METHODS: MockMethod[] = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface Props {
  mocks: MockRule[];
  mockMode: boolean;
  onToggleMode: (value: boolean) => void;
  onAdd: (mock: MockRule) => void;
  onUpdate: (id: string, patch: Partial<MockRule>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function MockManagerModal({
  mocks,
  mockMode,
  onToggleMode,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal mock-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Mock server</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="auto-token cookie-toggle">
            <input
              type="checkbox"
              checked={mockMode}
              onChange={(e) => onToggleMode(e.target.checked)}
            />
            Bật <b>Mock mode</b> — request khớp rule sẽ trả về response giả, không gọi mạng
          </label>

          <div className="cookie-hint">
            URL pattern hỗ trợ khớp chính xác, tham số <code>:id</code> và ký tự đại diện{' '}
            <code>*</code>. Ví dụ: <code>https://api.example.com/users/:id</code> hoặc{' '}
            <code>/users/*</code>. Chỉ so khớp phần path (bỏ query).
          </div>

          {mocks.length === 0 ? (
            <p className="side-empty">Chưa có mock nào.</p>
          ) : (
            mocks.map((m) => (
              <div key={m.id} className="mock-card">
                <div className="mock-row">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    title="Bật/tắt rule"
                    onChange={(e) => onUpdate(m.id, { enabled: e.target.checked })}
                  />
                  <input
                    className="mock-name"
                    value={m.name}
                    placeholder="Tên mock"
                    onChange={(e) => onUpdate(m.id, { name: e.target.value })}
                  />
                  <button className="kv-del-btn" onClick={() => onDelete(m.id)} title="Xóa">
                    ×
                  </button>
                </div>

                <div className="mock-row">
                  <select
                    className="mock-method"
                    value={m.method}
                    onChange={(e) => onUpdate(m.id, { method: e.target.value as MockMethod })}
                  >
                    {METHODS.map((mm) => (
                      <option key={mm} value={mm}>
                        {mm}
                      </option>
                    ))}
                  </select>
                  <input
                    className="mock-url"
                    value={m.urlPattern}
                    placeholder="/users/:id  hoặc  https://api.example.com/*"
                    onChange={(e) => onUpdate(m.id, { urlPattern: e.target.value })}
                  />
                </div>

                <div className="mock-row">
                  <label className="mock-field">
                    Status
                    <input
                      type="number"
                      value={m.status}
                      onChange={(e) => onUpdate(m.id, { status: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="mock-field">
                    Delay (ms)
                    <input
                      type="number"
                      min={0}
                      value={m.delayMs}
                      onChange={(e) => onUpdate(m.id, { delayMs: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>

                <label className="field-label">Headers</label>
                <KeyValueEditor
                  items={m.headers}
                  onChange={(headers: KeyValue[]) => onUpdate(m.id, { headers })}
                  keyPlaceholder="Header"
                />

                <label className="field-label">Body</label>
                <textarea
                  className="body-input mock-body"
                  value={m.body}
                  placeholder={'{\n  "message": "mocked"\n}'}
                  onChange={(e) => onUpdate(m.id, { body: e.target.value })}
                  spellCheck={false}
                />
              </div>
            ))
          )}
        </div>

        <div className="modal-foot cookie-foot">
          <Button onClick={() => onAdd(newMock())}>+ Thêm mock</Button>
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
