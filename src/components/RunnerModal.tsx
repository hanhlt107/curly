import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Collection } from '../types/request';
import { sendRequest } from '../config/apiClient';
import { runTests } from '../config/tests';

interface Props {
  collection: Collection;
  vars: Record<string, string>;
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

export default function RunnerModal({ collection, vars, onClose }: Props) {
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
  const cancel = useRef(false);

  const patch = (id: string, p: Partial<RunRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const run = async () => {
    setRunning(true);
    setDone(false);
    cancel.current = false;
    for (const saved of collection.requests) {
      if (cancel.current) break;
      patch(saved.id, { status: 'running' });
      try {
        const res = await sendRequest(saved.request, vars);
        const tests = saved.request.tests.trim() ? runTests(saved.request.tests, res) : [];
        patch(saved.id, {
          status: 'done',
          code: res.status,
          durationMs: res.durationMs,
          testPass: tests.filter((t) => t.passed).length,
          testTotal: tests.length,
        });
      } catch (err) {
        patch(saved.id, { status: 'error', errorMsg: (err as { message?: string }).message });
      }
    }
    setRunning(false);
    setDone(true);
  };

  useEffect(() => {
    run();
    return () => {
      cancel.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const okCount = rows.filter((r) => r.status === 'done' && (r.code ?? 0) < 400).length;
  const failCount = rows.filter((r) => r.status === 'error' || (r.code ?? 0) >= 400).length;

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

        <div className="runner-summary">
          <span className="rs ok">{okCount} ok</span>
          <span className="rs err">{failCount} lỗi</span>
          <span className="rs total">{rows.length} request</span>
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
          <button className="send-btn" onClick={run} disabled={running}>
            {done ? 'Chạy lại' : running ? 'Đang chạy…' : 'Chạy'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
