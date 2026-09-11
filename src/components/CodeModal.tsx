import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApiRequest } from '../types/request';
import { parseCurl } from '../config/curl';
import { generateSnippet, SNIPPET_LANGS, type SnippetLang } from '../config/snippets';

interface Props {
  request: ApiRequest;
  onImport: (req: ApiRequest) => void;
  onClose: () => void;
}

type Mode = 'import' | 'export';

export default function CodeModal({ request, onImport, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('import');
  const [curlText, setCurlText] = useState('');
  const [err, setErr] = useState('');
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState(false);

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
            <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>
              Import cURL
            </button>
            <button className={mode === 'export' ? 'on' : ''} onClick={() => setMode('export')}>
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
              <p className="field-label">Dán lệnh cURL, Curly tự tách method, URL, headers, body…</p>
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
              <button className="ghost-btn" onClick={onClose}>
                Hủy
              </button>
              <button className="send-btn" onClick={doImport} disabled={!curlText.trim()}>
                Import
              </button>
            </>
          ) : (
            <>
              <button className="ghost-btn" onClick={onClose}>
                Đóng
              </button>
              <button className="send-btn" onClick={copy}>
                {copied ? '✓ Đã copy' : 'Copy code'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
