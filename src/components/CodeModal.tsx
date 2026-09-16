import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type { ApiRequest } from '../types/request';
import { parseCurl } from '../config/curl';
import { generateSnippet, SNIPPET_LANGS, type SnippetLang } from '../config/snippets';

interface Props {
  request: ApiRequest;
  onImport: (req: ApiRequest) => void;
  onImportSpec: (text: string) => number;
  onImportHar: (text: string) => number;
  onClose: () => void;
}

type Mode = 'import' | 'openapi' | 'har' | 'export';

export default function CodeModal({
  request,
  onImport,
  onImportSpec,
  onImportHar,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>('import');
  const [curlText, setCurlText] = useState('');
  const [specText, setSpecText] = useState('');
  const [harText, setHarText] = useState('');
  const [err, setErr] = useState('');
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState(false);
  const specFileRef = useRef<HTMLInputElement>(null);
  const harFileRef = useRef<HTMLInputElement>(null);

  const snippet = useMemo(() => generateSnippet(request, lang), [request, lang]);

  const doImport = () => {
    if (!curlText.trim()) return;
    try {
      const req = parseCurl(curlText);
      if (!req.url) {
        setErr('Không tìm thấy URL trong lệnh cURL.');
        return;
      }
      onImport(req);
      onClose();
    } catch {
      setErr('Không parse được lệnh cURL. Kiểm tra lại cú pháp.');
    }
  };

  const doImportSpec = () => {
    if (!specText.trim()) return;
    try {
      const count = onImportSpec(specText);
      if (count === 0) {
        setErr('Không tìm thấy operation nào trong spec.');
        return;
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Không đọc được OpenAPI/Swagger spec.');
    }
  };

  const readSpecFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSpecText(String(reader.result));
      setErr('');
    };
    reader.readAsText(file);
  };

  const doImportHar = () => {
    if (!harText.trim()) return;
    try {
      const count = onImportHar(harText);
      if (count === 0) {
        setErr('Không tìm thấy request http(s) nào trong file HAR.');
        return;
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Không đọc được file HAR.');
    }
  };

  const readHarFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setHarText(String(reader.result));
      setErr('');
    };
    reader.readAsText(file);
  };

  const copy = () => {
    navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal code-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="code-switch">
            <button
              className={mode === 'import' ? 'on' : ''}
              onClick={() => {
                setMode('import');
                setErr('');
              }}
            >
              Import cURL
            </button>
            <button
              className={mode === 'openapi' ? 'on' : ''}
              onClick={() => {
                setMode('openapi');
                setErr('');
              }}
            >
              OpenAPI
            </button>
            <button
              className={mode === 'har' ? 'on' : ''}
              onClick={() => {
                setMode('har');
                setErr('');
              }}
            >
              HAR
            </button>
            <button
              className={mode === 'export' ? 'on' : ''}
              onClick={() => {
                setMode('export');
                setErr('');
              }}
            >
              Code snippet
            </button>
          </div>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {mode === 'import' ? (
            <>
              <p className="field-label">
                Dán lệnh cURL, Curly tự tách method, URL, headers, body…
              </p>
              <textarea
                className="code-input"
                autoFocus
                spellCheck={false}
                placeholder={`curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"name":"lan"}'`}
                value={curlText}
                onChange={(e) => {
                  setCurlText(e.target.value);
                  setErr('');
                }}
              />
              {err && <p className="code-err">{err}</p>}
            </>
          ) : mode === 'openapi' ? (
            <>
              <p className="field-label">
                Dán nội dung OpenAPI v3 / Swagger v2 (JSON hoặc YAML), hoặc tải file{' '}
                <code>.json</code> / <code>.yaml</code>. Curly tạo collection với thư mục theo tag.
              </p>
              <textarea
                className="code-input"
                autoFocus
                spellCheck={false}
                placeholder={
                  'openapi: 3.0.0\ninfo:\n  title: My API\nservers:\n  - url: https://api.example.com\npaths:\n  /users:\n    get:\n      summary: List users'
                }
                value={specText}
                onChange={(e) => {
                  setSpecText(e.target.value);
                  setErr('');
                }}
              />
              <div className="dotenv-controls">
                <button className="env-add" onClick={() => specFileRef.current?.click()}>
                  ↧ Chọn file spec
                </button>
                <input
                  ref={specFileRef}
                  type="file"
                  accept=".json,.yaml,.yml,application/json,text/yaml"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readSpecFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {err && <p className="code-err">{err}</p>}
            </>
          ) : mode === 'har' ? (
            <>
              <p className="field-label">
                Dán nội dung file <code>.har</code> (HTTP Archive xuất từ tab Network của DevTools),
                hoặc tải file lên. Curly tạo collection nhóm request theo host.
              </p>
              <textarea
                className="code-input"
                autoFocus
                spellCheck={false}
                placeholder={'{\n  "log": {\n    "entries": [ … ]\n  }\n}'}
                value={harText}
                onChange={(e) => {
                  setHarText(e.target.value);
                  setErr('');
                }}
              />
              <div className="dotenv-controls">
                <button className="env-add" onClick={() => harFileRef.current?.click()}>
                  ↧ Chọn file .har
                </button>
                <input
                  ref={harFileRef}
                  type="file"
                  accept=".har,.json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readHarFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {err && <p className="code-err">{err}</p>}
            </>
          ) : (
            <>
              <div className="lang-tabs">
                {SNIPPET_LANGS.map((l) => (
                  <button
                    key={l.id}
                    className={lang === l.id ? 'on' : ''}
                    onClick={() => setLang(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <pre className="code-output">{snippet}</pre>
            </>
          )}
        </div>

        <div className="modal-foot">
          {mode === 'import' ? (
            <>
              <Button onClick={onClose}>Hủy</Button>
              <Button variant="primary" onClick={doImport} disabled={!curlText.trim()}>
                Import
              </Button>
            </>
          ) : mode === 'openapi' ? (
            <>
              <Button onClick={onClose}>Hủy</Button>
              <Button variant="primary" onClick={doImportSpec} disabled={!specText.trim()}>
                Tạo collection
              </Button>
            </>
          ) : mode === 'har' ? (
            <>
              <Button onClick={onClose}>Hủy</Button>
              <Button variant="primary" onClick={doImportHar} disabled={!harText.trim()}>
                Tạo collection
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Đóng</Button>
              <Button variant="primary" onClick={copy}>
                {copied ? '✓ Đã copy' : 'Copy code'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
