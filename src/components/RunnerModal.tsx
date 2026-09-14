import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Collection } from '../types/request';
import { sendRequest } from '../config/apiClient';
import { runTests } from '../config/tests';
import { runPostScript, runPreScript } from '../config/script';
import { parseDataset, type DataRow } from '../config/dataset';

interface Props {
  collection: Collection;
  vars: Record<string, string>;
  onApplyVars?: (vars: Record<string, string>) => void;
  onClose: () => void;
}

interface RunRow {
  id: string;
  name: string;
  method: string;
  status: 'pending' | 'running' | 'done' | 'error';
  code?: number;
  durationMs?: number;
  testPass?: number;
  testTotal?: number;
  errorMsg?: string;
}

interface RunLog {
  iteration: number;
  data?: Record<string, string>;
  name: string;
  method: string;
  status?: number;
  durationMs?: number;
  testPass?: number;
  testTotal?: number;
  error?: string;
}

export default function RunnerModal({ collection, vars, onApplyVars, onClose }: Props) {
  const [rows, setRows] = useState<RunRow[]>(
    collection.requests.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.request.method,
      status: 'pending',
    })),
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [stopOnFail, setStopOnFail] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [iter, setIter] = useState(0);
  const [dataset, setDataset] = useState<DataRow[] | null>(null);
  const [dataName, setDataName] = useState('');
  const [dataError, setDataError] = useState('');
  const [runLog, setRunLog] = useState<RunLog[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);

  const loadDataFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseDataset(String(reader.result), file.name);
        setDataset(rows);
        setDataName(`${file.name} · ${rows.length} dòng`);
        setDataError('');
      } catch (err) {
        setDataset(null);
        setDataName('');
        setDataError((err as Error).message || 'Không đọc được file dữ liệu.');
      }
    };
    reader.readAsText(file);
  };

  const patch = (id: string, p: Partial<RunRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    setRunning(true);
    setDone(false);
    setStopped(false);
    cancel.current = false;
    let runVars: Record<string, string> = { ...vars };
    const loops = dataset ? dataset.length : Math.max(1, iterations);
    const log: RunLog[] = [];
    let aborted = false;

    for (let i = 0; i < loops && !aborted; i++) {
      if (cancel.current) break;
      setIter(i + 1);
      if (i > 0) {
        setRows((prev) => prev.map((r) => ({ ...r, status: 'pending' as const })));
      }
      if (dataset) runVars = { ...runVars, ...dataset[i] };

      for (const saved of collection.requests) {
        if (cancel.current) break;
        patch(saved.id, { status: 'running' });
        let failed = false;
        try {
          const r = saved.request;
          if (r.preScript.trim()) {
            const pre = runPreScript(r.preScript, runVars);
            runVars = pre.vars;
            if (pre.error) throw new Error('pre-script: ' + pre.error);
          }
          const res = await sendRequest(r, runVars);
          if (r.postScript.trim()) {
            const post = runPostScript(r.postScript, runVars, res);
            runVars = post.vars;
          }
          const tests = r.tests.trim() ? runTests(r.tests, res) : [];
          const pass = tests.filter((t) => t.passed).length;
          patch(saved.id, {
            status: 'done',
            code: res.status,
            durationMs: res.durationMs,
            testPass: pass,
            testTotal: tests.length,
          });
          log.push({
            iteration: i + 1,
            data: dataset ? dataset[i] : undefined,
            name: saved.name,
            method: r.method,
            status: res.status,
            durationMs: res.durationMs,
            testPass: pass,
            testTotal: tests.length,
          });
          failed = res.status >= 400 || pass < tests.length;
        } catch (err) {
          const msg = (err as { message?: string }).message;
          patch(saved.id, { status: 'error', errorMsg: msg });
          log.push({
            iteration: i + 1,
            data: dataset ? dataset[i] : undefined,
            name: saved.name,
            method: saved.request.method,
            error: msg,
          });
          failed = true;
        }
        if (stopOnFail && failed) {
          aborted = true;
          setStopped(true);
          break;
        }
        if (delayMs > 0) await sleep(delayMs);
      }
    }
    setRunLog(log);
    onApplyVars?.(runVars);
    setRunning(false);
    setDone(true);
  };

  useEffect(() => {
    return () => {
      cancel.current = true;
    };
  }, []);

  const okCount = rows.filter((r) => r.status === 'done' && (r.code ?? 0) < 400).length;
  const failCount = rows.filter((r) => r.status === 'error' || (r.code ?? 0) >= 400).length;
  const loopsShown = dataset ? dataset.length : iterations;
  const testPassed = runLog.reduce((s, l) => s + (l.testPass ?? 0), 0);
  const testTotal = runLog.reduce((s, l) => s + (l.testTotal ?? 0), 0);

  const buildReport = () => {
    const testPassed = runLog.reduce((s, l) => s + (l.testPass ?? 0), 0);
    const testTotal = runLog.reduce((s, l) => s + (l.testTotal ?? 0), 0);
    const failed = runLog.filter((l) => l.error || (l.status ?? 0) >= 400).length;
    return {
      collection: collection.name,
      at: new Date().toISOString(),
      dataFile: dataName || null,
      iterations: dataset ? dataset.length : iterations,
      summary: {
        runs: runLog.length,
        failed,
        tests: { passed: testPassed, total: testTotal },
      },
      results: runLog.map((l) => ({
        iteration: l.iteration,
        data: l.data ?? null,
        name: l.name,
        method: l.method,
        status: l.status ?? null,
        durationMs: l.durationMs ?? null,
        tests: l.testTotal ? { passed: l.testPass, total: l.testTotal } : null,
        error: l.error ?? null,
      })),
    };
  };

  const exportReport = () => {
    const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curly-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [copiedReport, setCopiedReport] = useState(false);
  const copyReport = () => {
    navigator.clipboard?.writeText(JSON.stringify(buildReport(), null, 2));
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 1400);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal runner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Runner · {collection.name}
            {running && <span className="run-spin" />}
          </h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="runner-config">
          <label>
            Lặp
            <input
              type="number"
              min={1}
              value={iterations}
              disabled={running || !!dataset}
              title={dataset ? 'Đang chạy theo file dữ liệu' : ''}
              onChange={(e) => setIterations(Math.max(1, Number(e.target.value) || 1))}
            />
            vòng
          </label>
          <label>
            Delay
            <input
              type="number"
              min={0}
              step={100}
              value={delayMs}
              disabled={running}
              onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value) || 0))}
            />
            ms
          </label>
          <label className="runner-check">
            <input
              type="checkbox"
              checked={stopOnFail}
              disabled={running}
              onChange={(e) => setStopOnFail(e.target.checked)}
            />
            Dừng khi lỗi
          </label>
          <div className="runner-data">
            <button
              className="ghost-btn sm"
              disabled={running}
              onClick={() => fileRef.current?.click()}
              title="File CSV hoặc JSON, mỗi dòng là một bộ biến {{var}}"
            >
              ↧ File dữ liệu
            </button>
            {dataset && (
              <span className="data-info">
                {dataName}
                <button
                  className="data-clear"
                  disabled={running}
                  onClick={() => {
                    setDataset(null);
                    setDataName('');
                  }}
                >
                  ×
                </button>
              </span>
            )}
            {dataError && <span className="data-err">{dataError}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadDataFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {(running || done) && loopsShown > 1 && (
            <span className="rs total">
              vòng {iter}/{loopsShown}
            </span>
          )}
        </div>

        <div className="runner-summary">
          <span className="rs ok">{okCount} ok</span>
          <span className="rs err">{failCount} lỗi</span>
          <span className="rs total">{rows.length} request</span>
          {testTotal > 0 && (
            <span className={`rs ${testPassed === testTotal ? 'ok' : 'err'}`}>
              Tests {testPassed}/{testTotal}
            </span>
          )}
          {stopped && <span className="rs err">⏹ Đã dừng vì lỗi</span>}
        </div>

        <div className="modal-body">
          <table className="runner-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Thời gian</th>
                <th>Tests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`run-${r.status}`}>
                  <td>
                    <span className={`m-tag m-${r.method}`}>{r.method}</span> {r.name}
                  </td>
                  <td>
                    {r.status === 'running' && <span className="run-dot running">chạy…</span>}
                    {r.status === 'pending' && <span className="run-dot pending">chờ</span>}
                    {r.status === 'done' && (
                      <span className={`badge sm ${(r.code ?? 0) < 400 ? 'ok' : 'error'}`}>
                        {r.code}
                      </span>
                    )}
                    {r.status === 'error' && (
                      <span className="badge sm error" title={r.errorMsg}>
                        ERR
                      </span>
                    )}
                  </td>
                  <td>{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                  <td>
                    {r.testTotal ? (
                      <span className={r.testPass === r.testTotal ? 'tests-ok' : 'tests-fail'}>
                        {r.testPass}/{r.testTotal}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-foot">
          <button className="ghost-btn" onClick={onClose}>
            Đóng
          </button>
          {done && (
            <>
              <button className="ghost-btn" onClick={copyReport}>
                {copiedReport ? '✓ Đã copy' : 'Copy report'}
              </button>
              <button className="ghost-btn" onClick={exportReport}>
                Export JSON
              </button>
            </>
          )}
          <button className="send-btn" onClick={run} disabled={running}>
            {done ? 'Chạy lại' : running ? 'Đang chạy…' : 'Chạy'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
