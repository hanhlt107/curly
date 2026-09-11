import { useMemo, useState } from 'react';
import type { ApiResponse, RequestError } from '../types/request';
import type { TestResult } from '../config/tests';
import { diffValues, diffSummary } from '../config/diff';

interface Props {
  loading: boolean;
  response: ApiResponse | null;
  prevResponse?: ApiResponse | null;
  error: RequestError | null;
  tests?: TestResult[];
}

type BodyMode = 'pretty' | 'raw' | 'preview';
type Tab = 'body' | 'headers' | 'cookies' | 'tests' | 'diff';

function parseCookies(headers: Record<string, string>): { name: string; value: string; attrs: string }[] {
  const raw = headers['set-cookie'];
  if (!raw) return [];
  return raw
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [pair, ...rest] = c.split(';');
      const eq = pair.indexOf('=');
      return {
        name: eq > -1 ? pair.slice(0, eq).trim() : pair.trim(),
        value: eq > -1 ? pair.slice(eq + 1).trim() : '',
        attrs: rest.map((r) => r.trim()).join('; '),
      };
    });
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400) return 'error';
  return '';
}

function prettify(data: unknown, raw: string): string {
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return raw;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Tô màu JSON đơn giản bằng regex → HTML. */
function highlightJson(text: string): string {
  const safe = esc(text);
  return safe.replace(
    /("(\\.|[^"\\])*"(\s*:)?)|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
    (m) => {
      let cls = 'j-num';
      if (/^"/.test(m)) cls = /:$/.test(m.trim()) ? 'j-key' : 'j-str';
      else if (/true|false/.test(m)) cls = 'j-bool';
      else if (/null/.test(m)) cls = 'j-null';
      return `<span class="${cls}">${m}</span>`;
    },
  );
}

function highlightSearch(html: string, term: string): string {
  if (!term) return html;
  const safe = esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
}

export default function ResponseView({ loading, response, prevResponse, error, tests }: Props) {
  const [tab, setTab] = useState<Tab>('body');
  const [mode, setMode] = useState<BodyMode>('pretty');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(
    () => (response ? prettify(response.data, response.raw) : ''),
    [response],
  );

  const bodyHtml = useMemo(() => {
    if (!response) return '';
    const text = mode === 'raw' ? response.raw : pretty;
    return highlightSearch(highlightJson(text), search);
  }, [response, mode, pretty, search]);

  const diffRows = useMemo(
    () => (prevResponse && response ? diffValues(prevResponse.data, response.data) : []),
    [prevResponse, response],
  );

  if (loading) {
    return (
      <div className="resp-state">
        <div className="spinner" />
        <span>Đang gọi…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="resp-state error">
        <strong>{error.message}</strong>
        {error.detail && <p>{error.detail}</p>}
      </div>
    );
  }

  if (!response) {
    return (
      <div className="resp-state muted">
        <span className="big-mark">〜</span>
        <p>Nhập URL rồi bấm Send để xem kết quả.</p>
      </div>
    );
  }

  const headerEntries = Object.entries(response.headers);
  const cookies = parseCookies(response.headers);
  const isHtml = /text\/html/i.test(response.headers['content-type'] || '');
  const testCount = tests?.length ?? 0;
  const testPass = tests?.filter((t) => t.passed).length ?? 0;
  const diffChanges = diffSummary(diffRows);
  const hasDiff = !!prevResponse && diffChanges.added + diffChanges.removed + diffChanges.changed > 0;

  const copy = () => {
    const text = mode === 'raw' ? response.raw : pretty;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="resp">
      <div className="resp-meta">
        <span className={`badge ${statusClass(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        <span className="meta-item">
          <b>{response.durationMs}</b> ms
        </span>
        <span className="meta-item">
          <b>{formatSize(response.sizeBytes)}</b>
        </span>
        {testCount > 0 && (
          <span className={`meta-tests ${testPass === testCount ? 'ok' : 'error'}`}>
            Tests {testPass}/{testCount}
          </span>
        )}
      </div>

      <div className="resp-tabbar">
        <div className="resp-tabs">
          <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
            Body
          </button>
          <button className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
            Headers <span className="pill">{headerEntries.length}</span>
          </button>
          {cookies.length > 0 && (
            <button className={tab === 'cookies' ? 'active' : ''} onClick={() => setTab('cookies')}>
              Cookies <span className="pill">{cookies.length}</span>
            </button>
          )}
          {testCount > 0 && (
            <button className={tab === 'tests' ? 'active' : ''} onClick={() => setTab('tests')}>
              Tests{' '}
              <span className={`pill ${testPass === testCount ? 'pill-ok' : 'pill-err'}`}>
                {testPass}/{testCount}
              </span>
            </button>
          )}
          {hasDiff && (
            <button className={tab === 'diff' ? 'active' : ''} onClick={() => setTab('diff')}>
              Diff <span className="pill pill-diff">⇄</span>
            </button>
          )}
        </div>

        {tab === 'body' && (
          <div className="resp-tools">
            <div className="seg">
              <button className={mode === 'pretty' ? 'on' : ''} onClick={() => setMode('pretty')}>
                Pretty
              </button>
              <button className={mode === 'raw' ? 'on' : ''} onClick={() => setMode('raw')}>
                Raw
              </button>
              {isHtml && (
                <button
                  className={mode === 'preview' ? 'on' : ''}
                  onClick={() => setMode('preview')}
                >
                  Preview
                </button>
              )}
            </div>
            <input
              className="resp-search"
              placeholder="Tìm trong body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="copy-btn" onClick={copy}>
              {copied ? '✓ Đã copy' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {tab === 'body' &&
        (mode === 'preview' && isHtml ? (
          <iframe className="resp-preview" sandbox="" title="preview" srcDoc={response.raw} />
        ) : (
          <pre
            className="resp-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml || '<span class="j-null">(rỗng)</span>' }}
          />
        ))}

      {tab === 'headers' && (
        <table className="kv-table readonly">
          <tbody>
            {headerEntries.map(([k, v]) => (
              <tr key={k}>
                <td className="hkey">{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'cookies' && (
        <table className="kv-table readonly">
          <tbody>
            {cookies.map((c) => (
              <tr key={c.name}>
                <td className="hkey">{c.name}</td>
                <td>{c.value}</td>
                <td className="cookie-attrs">{c.attrs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'tests' && (
        <ul className="test-results">
          {tests?.map((t, i) => (
            <li key={i} className={t.passed ? 'tr-pass' : 'tr-fail'}>
              <span className="tr-icon">{t.passed ? '✓' : '✕'}</span>
              <span className="tr-name">{t.name}</span>
              {t.message && <span className="tr-msg">{t.message}</span>}
            </li>
          ))}
        </ul>
      )}

      {tab === 'diff' && (
        <div className="diff-view">
          <div className="diff-legend">
            <span className="dl added">+{diffChanges.added} thêm</span>
            <span className="dl removed">−{diffChanges.removed} bớt</span>
            <span className="dl changed">±{diffChanges.changed} đổi</span>
            <span className="diff-note">so với lần gọi trước</span>
          </div>
          <table className="diff-table">
            <tbody>
              {diffRows
                .filter((r) => r.kind !== 'same')
                .map((r, i) => (
                  <tr key={i} className={`diff-${r.kind}`}>
                    <td className="diff-sign">
                      {r.kind === 'added' ? '+' : r.kind === 'removed' ? '−' : '±'}
                    </td>
                    <td className="diff-path">{r.path}</td>
                    <td className="diff-val">
                      {r.kind === 'added' ? (
                        <span className="dv-right">{r.right}</span>
                      ) : r.kind === 'removed' ? (
                        <span className="dv-left">{r.left}</span>
                      ) : (
                        <>
                          <span className="dv-left">{r.left}</span>
                          <span className="dv-arrow">→</span>
                          <span className="dv-right">{r.right}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
