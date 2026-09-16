import { useMemo, useState } from 'react';
import Button from './Button';
import type { ApiResponse, RequestError, RequestSnapshot, SnapshotMode } from '../types/request';
import type { TestResult } from '../config/tests';
import type { SchemaResult } from '../config/schema';
import { compareSnapshot } from '../config/snapshot';
import { diffValues, diffSummary } from '../config/diff';
import { evalJsonPath } from '../config/jsonpath';
import { generateTypes, TYPE_LANGS, type TypeLang } from '../config/typegen';
import {
  cellText,
  detectViz,
  imageDataUrl,
  isFlatObjectArray,
  isNumberArray,
  isObjectRecord,
  numericColumns,
  parseJson,
  tableColumns,
} from '../config/visualize';

interface Props {
  loading: boolean;
  response: ApiResponse | null;
  prevResponse?: ApiResponse | null;
  error: RequestError | null;
  tests?: TestResult[];
  schema?: SchemaResult;
  logs?: string[];
  snapshot?: RequestSnapshot | null;
  onSaveSnapshot?: () => void;
  onClearSnapshot?: () => void;
  onSetSnapshotMode?: (mode: SnapshotMode) => void;
  onSaveAsMock?: () => void;
}

type BodyMode = 'pretty' | 'raw' | 'preview';
type Tab =
  | 'body'
  | 'visualize'
  | 'query'
  | 'types'
  | 'headers'
  | 'cookies'
  | 'tests'
  | 'schema'
  | 'diff'
  | 'contract'
  | 'console';
type VizMode = 'tree' | 'table' | 'chart';
type ChartKind = 'bar' | 'line';

function parseCookies(
  headers: Record<string, string>,
): { name: string; value: string; attrs: string }[] {
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

function valueType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function JsonNode({ label, value, depth }: { label?: string; value: unknown; depth: number }) {
  const isArr = Array.isArray(value);
  const isObj = isObjectRecord(value);
  const [open, setOpen] = useState(depth < 1);

  if (!isArr && !isObj) {
    return (
      <div className="jt-row" style={{ paddingLeft: depth * 14 }}>
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className={`jt-val jt-${valueType(value)}`}>{cellText(value)}</span>
      </div>
    );
  }

  const entries: [string, unknown][] = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const summary = isArr ? `array[${entries.length}]` : `object{${entries.length}}`;

  return (
    <div className="jt-node">
      <div
        className="jt-row jt-toggle"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jt-caret">{open ? '▾' : '▸'}</span>
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className="jt-type">{summary}</span>
      </div>
      {open && entries.map(([k, v]) => <JsonNode key={k} label={k} value={v} depth={depth + 1} />)}
    </div>
  );
}

function MiniChart({
  values,
  labels,
  kind,
}: {
  values: number[];
  labels: string[];
  kind: ChartKind;
}) {
  const W = 680;
  const H = 240;
  const pad = 30;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const y = (v: number) => pad + innerH - ((v - min) / range) * innerH;
  const showLabels = values.length <= 16;
  const zeroY = y(0);

  return (
    <svg className="viz-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="viz-axis" />
      {kind === 'bar'
        ? values.map((v, i) => {
            const bw = innerW / values.length;
            const bx = pad + i * bw + bw * 0.15;
            const top = Math.min(y(v), zeroY);
            const hgt = Math.abs(zeroY - y(v));
            return (
              <g key={i}>
                <rect x={bx} y={top} width={bw * 0.7} height={hgt} className="viz-bar" />
                {showLabels && (
                  <text x={bx + bw * 0.35} y={H - 8} className="viz-label" textAnchor="middle">
                    {labels[i]}
                  </text>
                )}
              </g>
            );
          })
        : (() => {
            const px = (i: number) =>
              pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
            const pts = values.map((v, i) => `${px(i)},${y(v)}`).join(' ');
            return (
              <g>
                <polyline points={pts} className="viz-line" fill="none" />
                {values.map((v, i) => (
                  <g key={i}>
                    <circle cx={px(i)} cy={y(v)} r={3} className="viz-dot" />
                    {showLabels && (
                      <text x={px(i)} y={H - 8} className="viz-label" textAnchor="middle">
                        {labels[i]}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          })()}
      <text x={pad} y={pad - 10} className="viz-label">
        {max}
      </text>
    </svg>
  );
}

export default function ResponseView({
  loading,
  response,
  prevResponse,
  error,
  tests,
  schema,
  logs,
  snapshot,
  onSaveSnapshot,
  onClearSnapshot,
  onSetSnapshotMode,
  onSaveAsMock,
}: Props) {
  const [tab, setTab] = useState<Tab>('body');
  const [mode, setMode] = useState<BodyMode>('pretty');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [vizMode, setVizMode] = useState<VizMode | null>(null);
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [chartField, setChartField] = useState('');
  const [query, setQuery] = useState('');
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [typeLang, setTypeLang] = useState<TypeLang>('typescript');
  const [rootName, setRootName] = useState('Root');
  const [copiedType, setCopiedType] = useState(false);

  const pretty = useMemo(() => (response ? prettify(response.data, response.raw) : ''), [response]);

  const json = useMemo(
    () => (response ? parseJson(response.data, response.raw) : { value: undefined, ok: false }),
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

  const contract = useMemo(
    () => (snapshot && response ? compareSnapshot(snapshot, response) : undefined),
    [snapshot, response],
  );

  const queryResult = useMemo(
    () =>
      json.ok
        ? evalJsonPath(query, json.value)
        : { ok: false, matches: [], error: 'Response không phải JSON.' },
    [query, json],
  );

  const typesOutput = useMemo(
    () => (json.ok ? generateTypes(json.value, rootName, typeLang) : ''),
    [json, rootName, typeLang],
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
        {!!logs?.length && (
          <ul className="script-logs">
            {logs.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!response) {
    return (
      <div className="resp-state muted">
        <img className="big-mark" src={`${import.meta.env.BASE_URL}curly-mark.svg`} alt="" />
        <p>Nhập URL rồi bấm Send để xem kết quả.</p>
      </div>
    );
  }

  const headerEntries = Object.entries(response.headers);
  const cookies = parseCookies(response.headers);
  const contentType = response.headers['content-type'] || '';
  const isHtml = /text\/html/i.test(contentType);
  const testCount = tests?.length ?? 0;
  const testPass = tests?.filter((t) => t.passed).length ?? 0;
  const diffChanges = diffSummary(diffRows);
  const hasDiff =
    !!prevResponse && diffChanges.added + diffChanges.removed + diffChanges.changed > 0;
  const showContract = !!onSaveSnapshot;
  const contractDrifts = contract
    ? snapshot?.mode === 'structural'
      ? contract.drifts.filter((d) => d.kind !== 'value')
      : contract.drifts
    : [];

  const vizKind = detectViz(contentType, response.data, response.raw);
  const jsonVal = json.value;
  const flatRows = isFlatObjectArray(jsonVal) ? jsonVal : null;
  const numArr = isNumberArray(jsonVal);
  const numCols = flatRows ? numericColumns(flatRows) : [];
  const canTable = !!flatRows;
  const canChart = numArr || numCols.length > 0;
  const vizModes: VizMode[] = [
    'tree',
    ...(canTable ? (['table'] as VizMode[]) : []),
    ...(canChart ? (['chart'] as VizMode[]) : []),
  ];
  const autoMode: VizMode = numArr ? 'chart' : flatRows ? 'table' : 'tree';
  const effMode: VizMode = vizMode && vizModes.includes(vizMode) ? vizMode : autoMode;

  const effField = chartField && numCols.includes(chartField) ? chartField : numCols[0] || '';
  const labelCol = flatRows ? tableColumns(flatRows).find((c) => !numCols.includes(c)) : undefined;
  const chartValues = numArr
    ? (jsonVal as number[])
    : flatRows
      ? flatRows.map((r) => Number(r[effField] ?? 0))
      : [];
  const chartLabels = numArr
    ? (jsonVal as number[]).map((_, i) => String(i))
    : flatRows
      ? flatRows.map((r, i) => (labelCol ? cellText(r[labelCol]) : String(i)))
      : [];

  const copy = () => {
    const text = mode === 'raw' ? response.raw : pretty;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const matched = queryResult.matches;
  const queryText = JSON.stringify(matched.length === 1 ? matched[0] : matched, null, 2);

  const copyQuery = () => {
    navigator.clipboard?.writeText(queryText);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 1200);
  };

  const copyTypes = () => {
    navigator.clipboard?.writeText(typesOutput);
    setCopiedType(true);
    setTimeout(() => setCopiedType(false), 1200);
  };

  return (
    <div className="resp">
      <div className="resp-meta">
        <span className={`badge ${statusClass(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        {response.mocked && (
          <span className="badge-mock" title="Response giả từ mock rule">
            🎭 Mocked
          </span>
        )}
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
        {schema && (
          <span className={`meta-tests ${schema.ok ? 'ok' : 'error'}`}>
            Schema {schema.ok ? 'OK' : `${schema.errors.length} lỗi`}
          </span>
        )}
        {contract && (
          <span className={`meta-tests ${contract.ok ? 'ok' : 'error'}`}>
            Contract {contract.ok ? 'OK' : 'lệch'}
          </span>
        )}
        {onSaveAsMock && (
          <button
            className="mock-save-btn"
            onClick={onSaveAsMock}
            title="Tạo mock rule từ response hiện tại"
          >
            🎭 Lưu thành mock
          </button>
        )}
      </div>

      <div className="resp-tabbar">
        <div className="resp-tabs">
          <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
            Body
          </button>
          <button
            className={tab === 'visualize' ? 'active' : ''}
            onClick={() => setTab('visualize')}
          >
            Visualize
          </button>
          {json.ok && (
            <button className={tab === 'query' ? 'active' : ''} onClick={() => setTab('query')}>
              JSONPath
            </button>
          )}
          {json.ok && (
            <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>
              Types
            </button>
          )}
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
          {schema && (
            <button className={tab === 'schema' ? 'active' : ''} onClick={() => setTab('schema')}>
              Schema{' '}
              <span className={`pill ${schema.ok ? 'pill-ok' : 'pill-err'}`}>
                {schema.ok ? '✓' : schema.errors.length}
              </span>
            </button>
          )}
          {hasDiff && (
            <button className={tab === 'diff' ? 'active' : ''} onClick={() => setTab('diff')}>
              Diff <span className="pill pill-diff">⇄</span>
            </button>
          )}
          {showContract && (
            <button
              className={tab === 'contract' ? 'active' : ''}
              onClick={() => setTab('contract')}
            >
              Snapshot
              {contract && (
                <span className={`pill ${contract.ok ? 'pill-ok' : 'pill-err'}`}>
                  {contract.ok ? '✓' : '!'}
                </span>
              )}
            </button>
          )}
          {!!logs?.length && (
            <button className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}>
              Console <span className="pill">{logs.length}</span>
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

        {tab === 'visualize' && vizKind === 'json' && (
          <div className="resp-tools">
            <div className="seg">
              <button className={effMode === 'tree' ? 'on' : ''} onClick={() => setVizMode('tree')}>
                Tree
              </button>
              {canTable && (
                <button
                  className={effMode === 'table' ? 'on' : ''}
                  onClick={() => setVizMode('table')}
                >
                  Table
                </button>
              )}
              {canChart && (
                <button
                  className={effMode === 'chart' ? 'on' : ''}
                  onClick={() => setVizMode('chart')}
                >
                  Chart
                </button>
              )}
            </div>
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

      {tab === 'visualize' && (
        <div className="viz">
          {vizKind === 'image' &&
            (() => {
              const src = imageDataUrl(contentType, response.raw);
              return src ? (
                <img className="viz-image" src={src} alt="response" />
              ) : (
                <p className="viz-note">Không dựng được ảnh từ nội dung nhị phân. Xem tab Body.</p>
              );
            })()}

          {vizKind === 'html' && (
            <iframe
              className="resp-preview viz-html"
              sandbox=""
              title="visualize"
              srcDoc={response.raw}
            />
          )}

          {vizKind === 'json' && effMode === 'tree' && (
            <div className="viz-tree">
              <JsonNode value={jsonVal} depth={0} />
            </div>
          )}

          {vizKind === 'json' && effMode === 'table' && flatRows && (
            <div className="viz-table-wrap">
              <table className="viz-table">
                <thead>
                  <tr>
                    {tableColumns(flatRows).map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map((row, i) => (
                    <tr key={i}>
                      {tableColumns(flatRows).map((c) => (
                        <td key={c}>{cellText(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {vizKind === 'json' && effMode === 'chart' && (
            <div className="viz-chart-wrap">
              <div className="viz-chart-tools">
                <div className="seg">
                  <button
                    className={chartKind === 'bar' ? 'on' : ''}
                    onClick={() => setChartKind('bar')}
                  >
                    Bar
                  </button>
                  <button
                    className={chartKind === 'line' ? 'on' : ''}
                    onClick={() => setChartKind('line')}
                  >
                    Line
                  </button>
                </div>
                {flatRows && numCols.length > 0 && (
                  <select
                    className="viz-select"
                    value={effField}
                    onChange={(e) => setChartField(e.target.value)}
                  >
                    {numCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {chartValues.length ? (
                <MiniChart values={chartValues} labels={chartLabels} kind={chartKind} />
              ) : (
                <p className="viz-note">Không có dữ liệu số để vẽ.</p>
              )}
            </div>
          )}

          {vizKind === 'unknown' && (
            <p className="viz-note">
              Không nhận diện được kiểu dữ liệu để trực quan hóa. Xem tab Body để đọc nội dung thô.
            </p>
          )}
        </div>
      )}

      {tab === 'query' && (
        <div className="qp">
          <div className="qp-bar">
            <input
              className="qp-input"
              placeholder="$.data[0].name  ·  $..id  ·  $.items[*].price"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
            <button className="copy-btn" onClick={copyQuery} disabled={!queryResult.ok}>
              {copiedQuery ? '✓ Đã copy' : 'Copy'}
            </button>
          </div>
          {!query.trim() ? (
            <p className="viz-note">
              Nhập biểu thức JSONPath để lọc response. Hỗ trợ $, .key, ['key'], [0], [-1], .*, [*],
              ..key, [a:b].
            </p>
          ) : !queryResult.ok ? (
            <p className="code-err">Biểu thức không hợp lệ: {queryResult.error}</p>
          ) : matched.length === 0 ? (
            <p className="viz-note">Không có kết quả nào khớp với biểu thức.</p>
          ) : (
            <>
              <div className="qp-count">{matched.length} kết quả</div>
              <pre className="code-output">{queryText}</pre>
            </>
          )}
        </div>
      )}

      {tab === 'types' && (
        <div className="types-view">
          <div className="types-bar">
            <div className="lang-tabs">
              {TYPE_LANGS.map((l) => (
                <button
                  key={l.id}
                  className={typeLang === l.id ? 'on' : ''}
                  onClick={() => setTypeLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              className="types-name"
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="Tên type gốc"
              spellCheck={false}
            />
            <button className="copy-btn" onClick={copyTypes}>
              {copiedType ? '✓ Đã copy' : 'Copy'}
            </button>
          </div>
          <pre className="code-output">{typesOutput}</pre>
        </div>
      )}

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

      {tab === 'schema' &&
        schema &&
        (schema.ok ? (
          <ul className="test-results">
            <li className="tr-pass">
              <span className="tr-icon">✓</span>
              <span className="tr-name">Response hợp lệ theo JSON Schema</span>
            </li>
          </ul>
        ) : (
          <ul className="test-results">
            {schema.errors.map((err, i) => (
              <li key={i} className="tr-fail">
                <span className="tr-icon">✕</span>
                <span className="tr-name">{err.path}</span>
                <span className="tr-msg">{err.message}</span>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'console' && (
        <ul className="script-logs">
          {logs?.map((line, i) => (
            <li key={i}>{line}</li>
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

      {tab === 'contract' && showContract && (
        <div className="contract-view">
          {!snapshot ? (
            <div className="contract-empty">
              <p className="viz-note">
                Chưa có snapshot cho request này. Lưu response hiện tại làm bản chuẩn (golden) để
                lần sau tự động so sánh và cảnh báo khi API thay đổi.
              </p>
              <Button onClick={onSaveSnapshot}>Lưu snapshot</Button>
            </div>
          ) : (
            <>
              <div className="contract-head">
                <div className="contract-golden">
                  <span className={`badge ${statusClass(snapshot.status)}`}>{snapshot.status}</span>
                  <span className="contract-at">
                    Golden lưu lúc {new Date(snapshot.at).toLocaleString()}
                  </span>
                </div>
                <div className="contract-actions">
                  <div className="seg">
                    <button
                      className={snapshot.mode === 'strict' ? 'on' : ''}
                      onClick={() => onSetSnapshotMode?.('strict')}
                      title="Cảnh báo cả khi giá trị thay đổi"
                    >
                      Strict
                    </button>
                    <button
                      className={snapshot.mode === 'structural' ? 'on' : ''}
                      onClick={() => onSetSnapshotMode?.('structural')}
                      title="Chỉ cảnh báo khi cấu trúc/khóa/kiểu thay đổi"
                    >
                      Cấu trúc
                    </button>
                  </div>
                  <Button size="sm" onClick={onSaveSnapshot}>
                    Cập nhật snapshot
                  </Button>
                  <Button size="sm" onClick={onClearSnapshot}>
                    Xóa snapshot
                  </Button>
                </div>
              </div>

              {contract && (
                <>
                  <div className={`contract-summary ${contract.ok ? 'ok' : 'error'}`}>
                    <span className="contract-icon">{contract.ok ? '✓' : '⚠'}</span>
                    {contract.summary}
                  </div>
                  {contract.statusChanged && (
                    <div className="contract-status">
                      Status: <b>{contract.oldStatus}</b> → <b>{contract.newStatus}</b>
                    </div>
                  )}
                  {contractDrifts.length > 0 && (
                    <table className="diff-table">
                      <tbody>
                        {contractDrifts.map((d, i) => (
                          <tr key={i} className={`diff-${d.kind === 'type' ? 'changed' : d.kind}`}>
                            <td className="diff-sign">
                              {d.kind === 'added'
                                ? '+'
                                : d.kind === 'removed'
                                  ? '−'
                                  : d.kind === 'type'
                                    ? '⚑'
                                    : '±'}
                            </td>
                            <td className="diff-path">{d.path}</td>
                            <td className="diff-val">
                              {d.kind === 'added' ? (
                                <span className="dv-right">{d.newVal}</span>
                              ) : d.kind === 'removed' ? (
                                <span className="dv-left">{d.oldVal}</span>
                              ) : (
                                <>
                                  <span className="dv-left">{d.oldVal}</span>
                                  <span className="dv-arrow">→</span>
                                  <span className="dv-right">{d.newVal}</span>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
