import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Environment } from '../types/request';
import { parseDotenv } from '../config/dotenv';

export interface DotenvTarget {
  mode: 'new' | 'merge';
  envId?: string;
  name?: string;
}

interface Props {
  environments: Environment[];
  defaultEnvId: string | null;
  onImport: (pairs: { key: string; value: string }[], target: DotenvTarget) => void;
  onClose: () => void;
}

export default function DotenvModal({ environments, defaultEnvId, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'new' | 'merge'>(defaultEnvId ? 'merge' : 'new');
  const [envId, setEnvId] = useState<string>(defaultEnvId ?? environments[0]?.id ?? '');
  const [name, setName] = useState('.env');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pairs = parseDotenv(text);

  const doImport = () => {
    if (!pairs.length) {
      setErr('Không tìm thấy biến KEY=VALUE nào.');
      return;
    }
    if (mode === 'merge' && !envId) {
      setErr('Chọn một environment để gộp vào.');
      return;
    }
    onImport(pairs, mode === 'merge' ? { mode, envId } : { mode, name });
    onClose();
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result));
      setErr('');
    };
    reader.readAsText(file);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal code-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>↧ Import .env</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="field-label">
            Dán nội dung file <code>.env</code> (mỗi dòng <code>KEY=VALUE</code>, bỏ qua dòng trống
            và dòng <code>#</code> chú thích) hoặc tải file lên.
          </p>
          <textarea
            className="code-input"
            autoFocus
            spellCheck={false}
            placeholder={
              'BASE_URL=https://api.example.com\nAPI_KEY="abc 123"\n# comment\nTOKEN=xyz'
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setErr('');
            }}
          />

          <div className="dotenv-controls">
            <button className="env-add" onClick={() => fileRef.current?.click()}>
              ↧ Chọn file .env
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".env,.txt,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = '';
              }}
            />
            <span className="dotenv-count">{pairs.length} biến</span>
          </div>

          <div className="dotenv-target">
            <label>
              <input
                type="radio"
                name="dotenv-mode"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              Tạo environment mới
            </label>
            {mode === 'new' && (
              <input
                className="env-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên environment"
              />
            )}
            <label>
              <input
                type="radio"
                name="dotenv-mode"
                checked={mode === 'merge'}
                disabled={environments.length === 0}
                onChange={() => setMode('merge')}
              />
              Gộp vào environment có sẵn
            </label>
            {mode === 'merge' && (
              <select value={envId} onChange={(e) => setEnvId(e.target.value)}>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {err && <p className="code-err">{err}</p>}
        </div>

        <div className="modal-foot">
          <button className="ghost-btn" onClick={onClose}>
            Hủy
          </button>
          <button className="send-btn" onClick={doImport} disabled={!pairs.length}>
            Import {pairs.length ? `(${pairs.length})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
