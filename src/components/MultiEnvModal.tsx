import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type {
  ApiRequest,
  ApiResponse,
  Cookie,
  Environment,
  KeyValue,
  MockRule,
  RequestError,
} from '../types/request';
import { envToRecord, sendRequest } from '../config/apiClient';
import { matchMock, runMock } from '../config/mocks';
import { runPreScript } from '../config/script';
import { diffSummary, diffValues } from '../config/diff';

type RunStatus = 'pending' | 'running' | 'done' | 'error';

interface EnvResult {
  envId: string;
  envName: string;
  status: RunStatus;
  response?: ApiResponse;
  error?: RequestError;
}

interface Props {
  req: ApiRequest;
  environments: Environment[];
  globals: KeyValue[];
  cookies: Cookie[];
  mockMode: boolean;
  mocks: MockRule[];
  onClose: () => void;
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400) return 'error';
  return '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function bodyValue(res: ApiResponse): unknown {
  if (res.data !== undefined && res.data !== null) return res.data;
  try {
    return res.raw.trim() ? JSON.parse(res.raw) : res.raw;
  } catch {
    return res.raw;
  }
}

export default function MultiEnvModal({
  req,
  environments,
  globals,
  cookies,
  mockMode,
  mocks,
  onClose,
}: Props) {
  const [results, setResults] = useState<EnvResult[]>(() =>
    environments.map((e) => ({ envId: e.id, envName: e.name, status: 'pending' as RunStatus })),
  );
  const [running, setRunning] = useState(true);
  const [baselineId, setBaselineId] = useState<string>(environments[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string>(environments[0]?.id ?? '');
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const globalVars = envToRecord(globals);
    const run = async () => {
      for (const env of environments) {
        if (cancelled.current) return;
        setResults((prev) =>
          prev.map((r) => (r.envId === env.id ? { ...r, status: 'running' } : r)),
        );
        let workVars: Record<string, string> = {
          ...globalVars,
          ...envToRecord(env.variables),
        };
        let error: RequestError | null = null;
        if (req.preScript.trim()) {
          const pre = runPreScript(req.preScript, workVars);
          workVars = pre.vars;
          if (pre.error) error = { message: 'Lỗi pre-request script', detail: pre.error };
        }
        let response: ApiResponse | undefined;
        if (!error) {
          try {
            const mockRule = mockMode ? matchMock(req, mocks, workVars) : null;
            response = mockRule
              ? await runMock(mockRule, workVars)
              : await sendRequest(req, workVars, cookies);
          } catch (e) {
            error = e as RequestError;
          }
        }
        if (cancelled.current) return;
        setResults((prev) =>
          prev.map((r) =>
            r.envId === env.id
              ? { ...r, status: error ? 'error' : 'done', response, error: error ?? undefined }
              : r,
          ),
        );
      }
      if (!cancelled.current) setRunning(false);
    };
    run();
    return () => {
      cancelled.current = true;
    };
  }, [req, environments, globals, cookies, mockMode, mocks]);

  const doneCount = results.filter((r) => r.status === 'done' || r.status === 'error').length;
  const baseline = results.find((r) => r.envId === baselineId);
  const selected = results.find((r) => r.envId === selectedId);

  const diffRows = useMemo(() => {
    if (!selected?.response || !baseline?.response) return [];
    if (selected.envId === baseline.envId) return [];
    return diffValues(bodyValue(baseline.response), bodyValue(selected.response));
  }, [selected, baseline]);

  const diffChanges = diffSummary(diffRows);
  const changedRows = diffRows.filter((r) => r.kind !== 'same');
  const selectedPretty = selected?.response
    ? (() => {
        try {
          return JSON.stringify(bodyValue(selected.response), null, 2);
        } catch {
          return selected.response.raw;
        }
      })()
    : '';

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal menv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="menv-title">
            <strong>Chạy trên mọi môi trường</strong>
            <span className="menv-sub">
              {req.method} {req.url || '(chưa có URL)'}
            </span>
          </div>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body menv-body">
          <div className="menv-progress">
            {running ? `Đang chạy ${doneCount}/${results.length} môi trường…` : 'Đã chạy xong.'}
            <span className="menv-baseline">
              Mốc so sánh:
              <select value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
                {results.map((r) => (
                  <option key={r.envId} value={r.envId}>
                    {r.envName}
                  </option>
                ))}
              </select>
            </span>
          </div>

          {results.length === 0 ? (
            <p className="viz-note">
              Chưa có môi trường nào. Tạo môi trường trong phần Environment để so sánh.
            </p>
          ) : (
            <table className="menv-table">
              <thead>
                <tr>
                  <th>Môi trường</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Size</th>
                  <th>Khác mốc</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const isBase = r.envId === baselineId;
                  const rowDiff =
                    !isBase && r.response && baseline?.response
                      ? diffSummary(diffValues(bodyValue(baseline.response), bodyValue(r.response)))
                      : null;
                  const changes = rowDiff ? rowDiff.added + rowDiff.removed + rowDiff.changed : 0;
                  return (
                    <tr
                      key={r.envId}
                      className={r.envId === selectedId ? 'menv-row on' : 'menv-row'}
                      onClick={() => setSelectedId(r.envId)}
                    >
                      <td>
                        {r.envName}
                        {isBase && <span className="menv-tag">mốc</span>}
                      </td>
                      <td>
                        {r.status === 'running' || r.status === 'pending' ? (
                          <span className="menv-muted">
                            {r.status === 'running' ? 'đang chạy…' : 'chờ'}
                          </span>
                        ) : r.error ? (
                          <span className="badge error" title={r.error.detail}>
                            lỗi
                          </span>
                        ) : r.response ? (
                          <span className={`badge ${statusClass(r.response.status)}`}>
                            {r.response.status}
                          </span>
                        ) : null}
                      </td>
                      <td>{r.response ? `${r.response.durationMs} ms` : '—'}</td>
                      <td>{r.response ? formatSize(r.response.sizeBytes) : '—'}</td>
                      <td>
                        {isBase ? (
                          <span className="menv-muted">—</span>
                        ) : r.status === 'error' ? (
                          <span className="menv-muted">—</span>
                        ) : changes > 0 ? (
                          <span className="menv-diffnum">{changes} khác</span>
                        ) : r.response && baseline?.response ? (
                          <span className="menv-same">giống</span>
                        ) : (
                          <span className="menv-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {selected && (
            <div className="menv-detail">
              <div className="menv-detail-head">
                <strong>{selected.envName}</strong>
                {selected.error ? (
                  <span className="menv-err">
                    {selected.error.message}
                    {selected.error.detail ? ` — ${selected.error.detail}` : ''}
                  </span>
                ) : baseline && selected.envId !== baseline.envId && baseline.response ? (
                  <span className="menv-legend">
                    <span className="dl added">+{diffChanges.added}</span>
                    <span className="dl removed">−{diffChanges.removed}</span>
                    <span className="dl changed">±{diffChanges.changed}</span>
                    <span className="diff-note">so với {baseline.envName}</span>
                  </span>
                ) : null}
              </div>

              {changedRows.length > 0 && (
                <table className="diff-table">
                  <tbody>
                    {changedRows.map((d, i) => (
                      <tr key={i} className={`diff-${d.kind}`}>
                        <td className="diff-sign">
                          {d.kind === 'added' ? '+' : d.kind === 'removed' ? '−' : '±'}
                        </td>
                        <td className="diff-path">{d.path}</td>
                        <td className="diff-val">
                          {d.kind === 'added' ? (
                            <span className="dv-right">{d.right}</span>
                          ) : d.kind === 'removed' ? (
                            <span className="dv-left">{d.left}</span>
                          ) : (
                            <>
                              <span className="dv-left">{d.left}</span>
                              <span className="dv-arrow">→</span>
                              <span className="dv-right">{d.right}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selected.response && <pre className="menv-pre">{selectedPretty}</pre>}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
