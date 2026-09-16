import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type {
  ApiRequest,
  ApiResponse,
  Collection,
  ExtractSource,
  SavedRequest,
  Workflow,
  WorkflowExtraction,
  WorkflowStep,
} from '../types/request';
import type { LocatedRequest } from '../config/collections';
import { findRequest, locateRequests } from '../config/collections';
import { sendRequest } from '../config/apiClient';
import { evalJsonPath } from '../config/jsonpath';

interface Props {
  workflows: Workflow[];
  collections: Collection[];
  vars: Record<string, string>;
  onAdd: (name: string) => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Workflow>) => void;
  onApplyVars?: (vars: Record<string, string>) => void;
  onClose: () => void;
}

interface StepRun {
  status: 'pending' | 'running' | 'done' | 'error';
  code?: number;
  durationMs?: number;
  error?: string;
  produced?: { varName: string; value: string; ok: boolean }[];
}

type DragKind = 'palette' | 'step' | null;

const VAR_RE = /\{\{\s*([\w.$:-]+)\s*\}\}/g;

function coerce(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function resolveStep(step: WorkflowStep, collections: Collection[]): SavedRequest | null {
  const col = collections.find((c) => c.id === step.collectionId);
  if (col) {
    const r = findRequest(col, step.requestId);
    if (r) return r;
  }
  for (const c of collections) {
    const r = findRequest(c, step.requestId);
    if (r) return r;
  }
  return null;
}

function referencedVars(req: ApiRequest): string[] {
  const text = [
    req.url,
    req.body,
    req.graphqlVars,
    req.auth.bearerToken,
    req.auth.basicUser,
    req.auth.basicPass,
    req.auth.apiKeyName,
    req.auth.apiKeyValue,
    ...req.params.flatMap((p) => [p.key, p.value]),
    ...req.headers.flatMap((h) => [h.key, h.value]),
    ...req.formData.flatMap((f) => [f.key, f.value]),
  ].join(' ');
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

function applyExtraction(
  ext: WorkflowExtraction,
  res: ApiResponse,
  vars: Record<string, string>,
): { value: string; ok: boolean } {
  const name = ext.varName.trim();
  if (!name) return { value: '', ok: false };
  if (ext.source === 'status') {
    const value = String(res.status);
    vars[name] = value;
    return { value, ok: true };
  }
  if (ext.source === 'header') {
    const key = ext.path.trim().toLowerCase();
    const hit = Object.entries(res.headers).find(([k]) => k.toLowerCase() === key);
    const value = hit ? hit[1] : '';
    vars[name] = value;
    return { value, ok: !!hit };
  }
  const r = evalJsonPath(ext.path, res.data);
  if (!r.ok || r.matches.length === 0) {
    vars[name] = '';
    return { value: '', ok: false };
  }
  const value = coerce(r.matches[0]);
  vars[name] = value;
  return { value, ok: true };
}

export default function WorkflowModal({
  workflows,
  collections,
  vars,
  onAdd,
  onRename,
  onDelete,
  onUpdate,
  onApplyVars,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(workflows[0]?.id ?? null);
  const [runs, setRuns] = useState<Record<string, StepRun>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [stopOnError, setStopOnError] = useState(true);
  const [delayMs, setDelayMs] = useState(0);
  const [producedVars, setProducedVars] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState(false);
  const [filter, setFilter] = useState('');
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragPalette = useRef<string | null>(null);
  const cancel = useRef(false);

  useEffect(() => {
    return () => {
      cancel.current = true;
    };
  }, []);

  const locations = useMemo(() => locateRequests(collections), [collections]);
  const wf = workflows.find((w) => w.id === selectedId) ?? null;

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, LocatedRequest[]>();
    for (const l of locations) {
      if (q && !`${l.path} ${l.saved.name}`.toLowerCase().includes(q)) continue;
      const arr = map.get(l.path) ?? [];
      arr.push(l);
      map.set(l.path, arr);
    }
    return [...map.entries()];
  }, [locations, filter]);

  const resetRun = () => {
    setRuns({});
    setDone(false);
    setStopped(false);
    setProducedVars({});
    setApplied(false);
  };

  const mutateSteps = (fn: (steps: WorkflowStep[]) => WorkflowStep[]) => {
    if (!wf) return;
    onUpdate(wf.id, { steps: fn(wf.steps) });
    resetRun();
  };

  const createWorkflow = () => {
    const id = onAdd('Chuỗi mới');
    setSelectedId(id);
    resetRun();
  };

  const buildStep = (loc: LocatedRequest): WorkflowStep => ({
    id: crypto.randomUUID(),
    collectionId: loc.collectionId,
    requestId: loc.saved.id,
    name: loc.saved.name,
    extractions: [],
  });

  const addStepAt = (savedId: string, at: number) => {
    if (!wf) return;
    const loc = locations.find((l) => l.saved.id === savedId);
    if (!loc) return;
    mutateSteps((steps) => {
      const next = [...steps];
      next.splice(Math.max(0, Math.min(at, next.length)), 0, buildStep(loc));
      return next;
    });
  };

  const reorderStep = (from: number, at: number) =>
    mutateSteps((steps) => {
      if (at === from || at === from + 1) return steps;
      const next = [...steps];
      const [item] = next.splice(from, 1);
      next.splice(at > from ? at - 1 : at, 0, item);
      return next;
    });

  const clearDrag = () => {
    dragPalette.current = null;
    setDragKind(null);
    setDragIndex(null);
    setDropAt(null);
  };

  const handleDrop = (at: number) => {
    if (dragKind === 'palette' && dragPalette.current) addStepAt(dragPalette.current, at);
    else if (dragKind === 'step' && dragIndex !== null) reorderStep(dragIndex, at);
    clearDrag();
  };

  const removeStep = (id: string) => mutateSteps((steps) => steps.filter((s) => s.id !== id));

  const moveStep = (index: number, delta: number) =>
    mutateSteps((steps) => {
      const next = [...steps];
      const to = index + delta;
      if (to < 0 || to >= next.length) return steps;
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });

  const patchStep = (id: string, patch: Partial<WorkflowStep>) =>
    mutateSteps((steps) => steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addExtraction = (stepId: string) =>
    patchStep(stepId, {
      extractions: [
        ...(wf?.steps.find((s) => s.id === stepId)?.extractions ?? []),
        { id: crypto.randomUUID(), source: 'body', path: '', varName: '' },
      ],
    });

  const updateExtraction = (stepId: string, extId: string, patch: Partial<WorkflowExtraction>) => {
    const step = wf?.steps.find((s) => s.id === stepId);
    if (!step) return;
    patchStep(stepId, {
      extractions: step.extractions.map((e) => (e.id === extId ? { ...e, ...patch } : e)),
    });
  };

  const removeExtraction = (stepId: string, extId: string) => {
    const step = wf?.steps.find((s) => s.id === stepId);
    if (!step) return;
    patchStep(stepId, { extractions: step.extractions.filter((e) => e.id !== extId) });
  };

  const setRun = (id: string, patch: StepRun) => setRuns((prev) => ({ ...prev, [id]: patch }));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    if (!wf || !wf.steps.length) return;
    setRunning(true);
    setDone(false);
    setStopped(false);
    setApplied(false);
    setRuns({});
    cancel.current = false;
    const runVars: Record<string, string> = { ...vars };
    const produced: Record<string, string> = {};
    let aborted = false;

    for (const step of wf.steps) {
      if (cancel.current) break;
      setRun(step.id, { status: 'running' });
      const saved = resolveStep(step, collections);
      if (!saved) {
        setRun(step.id, { status: 'error', error: 'Request đã bị xóa khỏi collection' });
        if (stopOnError) {
          aborted = true;
          break;
        }
        continue;
      }
      try {
        const res = await sendRequest(saved.request, runVars);
        const prod: { varName: string; value: string; ok: boolean }[] = [];
        for (const ext of step.extractions) {
          const r = applyExtraction(ext, res, runVars);
          const name = ext.varName.trim();
          if (name) {
            produced[name] = r.value;
            prod.push({ varName: name, value: r.value, ok: r.ok });
          }
        }
        setRun(step.id, {
          status: 'done',
          code: res.status,
          durationMs: res.durationMs,
          produced: prod,
        });
        if (stopOnError && res.status >= 400) {
          aborted = true;
          break;
        }
      } catch (err) {
        setRun(step.id, { status: 'error', error: (err as { message?: string }).message });
        if (stopOnError) {
          aborted = true;
          break;
        }
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    setProducedVars(produced);
    setRunning(false);
    setDone(true);
    setStopped(aborted);
  };

  const producedList = Object.entries(producedVars);

  const gap = (at: number) => {
    const showArrow = wf != null && at > 0 && at < wf.steps.length;
    const over = dropAt === at;
    return (
      <div
        className={`wf-gap ${over ? 'over' : ''} ${dragKind ? 'live' : ''}`}
        onDragOver={(e) => {
          if (!dragKind) return;
          e.preventDefault();
          if (dropAt !== at) setDropAt(at);
        }}
        onDrop={() => handleDrop(at)}
      >
        {over ? (
          <span className="wf-drop-here">thả vào đây</span>
        ) : (
          showArrow && <span className="wf-conn">↓</span>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Chuỗi request
            {running && <span className="run-spin" />}
          </h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="wf-body">
          <aside className="wf-side">
            <Button size="sm" className="wf-new" onClick={createWorkflow}>
              + Chuỗi mới
            </Button>
            <div className="wf-list">
              {workflows.length === 0 && <div className="wf-empty-side">Chưa có chuỗi nào.</div>}
              {workflows.map((w) => (
                <button
                  key={w.id}
                  className={`wf-item ${w.id === selectedId ? 'sel' : ''}`}
                  onClick={() => {
                    setSelectedId(w.id);
                    resetRun();
                  }}
                >
                  <span className="wf-item-name">{w.name}</span>
                  <span className="wf-item-count">{w.steps.length}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="wf-main">
            {!wf ? (
              <div className="wf-empty">
                Tạo một chuỗi để nối nhiều request lại với nhau. Mỗi bước có thể trích giá trị từ
                response thành biến <code>{'{{var}}'}</code> cho các bước sau dùng.
              </div>
            ) : (
              <>
                <div className="wf-head-row">
                  <input
                    className="wf-name-input"
                    value={wf.name}
                    onChange={(e) => onRename(wf.id, e.target.value)}
                    placeholder="Tên chuỗi"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      onDelete(wf.id);
                      const rest = workflows.filter((w) => w.id !== wf.id);
                      setSelectedId(rest[0]?.id ?? null);
                      resetRun();
                    }}
                  >
                    Xóa chuỗi
                  </Button>
                </div>

                <p className="wf-hint">
                  Kéo request từ cột bên phải thả vào luồng. Kéo các bước để đổi thứ tự.
                </p>

                <div className="wf-work">
                  <div
                    className={`wf-canvas ${dragKind ? 'live' : ''}`}
                    onDragOver={(e) => {
                      if (dragKind && wf.steps.length === 0) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (wf.steps.length === 0) handleDrop(0);
                    }}
                  >
                    {wf.steps.length === 0 ? (
                      <div
                        className={`wf-dropzone ${dragKind ? 'live' : ''} ${dropAt === 0 ? 'over' : ''}`}
                      >
                        <span className="wf-dropzone-ico">⤵</span>
                        Kéo request từ cột bên phải và thả vào đây để tạo bước đầu tiên.
                      </div>
                    ) : (
                      <div className="wf-flow">
                        {gap(0)}
                        {wf.steps.map((step, i) => {
                          const saved = resolveStep(step, collections);
                          const missing = !saved;
                          const rs = runs[step.id];
                          const consumes = saved ? referencedVars(saved.request) : [];
                          const produces = step.extractions
                            .map((e) => e.varName.trim())
                            .filter(Boolean);
                          return (
                            <Fragment key={step.id}>
                              <div
                                className={`wf-card ${missing ? 'missing' : ''} ${rs ? `run-${rs.status}` : ''} ${dragKind === 'step' && dragIndex === i ? 'dragging' : ''}`}
                                draggable
                                onDragStart={() => {
                                  setDragIndex(i);
                                  setDragKind('step');
                                }}
                                onDragEnd={clearDrag}
                              >
                                <div className="wf-card-head">
                                  <span className="wf-grip" title="Kéo để đổi thứ tự">
                                    ⠿
                                  </span>
                                  <span className="wf-order">{i + 1}</span>
                                  <span className={`m-tag m-${saved?.request.method ?? 'GET'}`}>
                                    {saved?.request.method ?? '—'}
                                  </span>
                                  <span className="wf-step-name">{step.name}</span>
                                  {missing && <span className="wf-missing">đã xóa</span>}
                                  {rs?.status === 'running' && (
                                    <span className="run-dot running">chạy…</span>
                                  )}
                                  {rs?.status === 'done' && (
                                    <span
                                      className={`badge sm ${(rs.code ?? 0) < 400 ? 'ok' : 'error'}`}
                                    >
                                      {rs.code} · {rs.durationMs}ms
                                    </span>
                                  )}
                                  {rs?.status === 'error' && (
                                    <span className="badge sm error" title={rs.error}>
                                      lỗi
                                    </span>
                                  )}
                                  <div className="wf-card-actions">
                                    <button
                                      className="wf-ico"
                                      onClick={() => moveStep(i, -1)}
                                      disabled={i === 0}
                                      title="Lên"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      className="wf-ico"
                                      onClick={() => moveStep(i, 1)}
                                      disabled={i === wf.steps.length - 1}
                                      title="Xuống"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      className="wf-ico wf-ico-del"
                                      onClick={() => removeStep(step.id)}
                                      title="Xóa bước"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>

                                {rs?.status === 'error' && rs.error && (
                                  <div className="wf-err-msg">{rs.error}</div>
                                )}

                                {(consumes.length > 0 || produces.length > 0) && (
                                  <div className="wf-flow-tags">
                                    {consumes.map((v) => (
                                      <span
                                        key={`c-${v}`}
                                        className="wf-tag consume"
                                        title="Dùng biến"
                                      >
                                        ← {`{{${v}}}`}
                                      </span>
                                    ))}
                                    {produces.map((v) => (
                                      <span
                                        key={`p-${v}`}
                                        className="wf-tag produce"
                                        title="Tạo biến"
                                      >
                                        → {`{{${v}}}`}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                <div className="wf-extractions">
                                  {step.extractions.map((ext) => {
                                    const prod = rs?.produced?.find(
                                      (p) => p.varName === ext.varName.trim(),
                                    );
                                    return (
                                      <div key={ext.id} className="wf-ext-row">
                                        <select
                                          value={ext.source}
                                          onChange={(e) =>
                                            updateExtraction(step.id, ext.id, {
                                              source: e.target.value as ExtractSource,
                                            })
                                          }
                                        >
                                          <option value="body">body</option>
                                          <option value="header">header</option>
                                          <option value="status">status</option>
                                        </select>
                                        {ext.source !== 'status' && (
                                          <input
                                            className="wf-ext-path"
                                            value={ext.path}
                                            placeholder={
                                              ext.source === 'body' ? '$.data.token' : 'ETag'
                                            }
                                            onChange={(e) =>
                                              updateExtraction(step.id, ext.id, {
                                                path: e.target.value,
                                              })
                                            }
                                          />
                                        )}
                                        <span className="wf-ext-arrow">→</span>
                                        <input
                                          className="wf-ext-var"
                                          value={ext.varName}
                                          placeholder="tênBien"
                                          onChange={(e) =>
                                            updateExtraction(step.id, ext.id, {
                                              varName: e.target.value,
                                            })
                                          }
                                        />
                                        {prod && (
                                          <span
                                            className={`wf-ext-val ${prod.ok ? 'ok' : 'miss'}`}
                                            title={prod.ok ? prod.value : 'Không tìm thấy giá trị'}
                                          >
                                            {prod.ok ? prod.value || '(rỗng)' : 'không khớp'}
                                          </span>
                                        )}
                                        <button
                                          className="wf-ico wf-ico-del"
                                          onClick={() => removeExtraction(step.id, ext.id)}
                                          title="Xóa"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    );
                                  })}
                                  <button
                                    className="link-btn wf-add-ext"
                                    onClick={() => addExtraction(step.id)}
                                  >
                                    + Trích giá trị
                                  </button>
                                </div>
                              </div>
                              {gap(i + 1)}
                            </Fragment>
                          );
                        })}
                      </div>
                    )}

                    {done && producedList.length > 0 && (
                      <div className="wf-summary">
                        <div className="wf-summary-head">Biến đã tạo</div>
                        {producedList.map(([k, v]) => (
                          <div key={k} className="wf-summary-row">
                            <code>{`{{${k}}}`}</code>
                            <span className="wf-summary-val">{v || '(rỗng)'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="wf-palette">
                    <div className="wf-palette-head">Request đã lưu</div>
                    <input
                      className="wf-palette-search"
                      value={filter}
                      placeholder="Tìm request…"
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    <div className="wf-palette-list">
                      {grouped.length === 0 && (
                        <div className="wf-palette-empty">
                          {locations.length === 0
                            ? 'Chưa có request nào được lưu.'
                            : 'Không tìm thấy request.'}
                        </div>
                      )}
                      {grouped.map(([path, items]) => (
                        <div key={path} className="wf-palette-group">
                          <div className="wf-palette-group-name" title={path}>
                            {path}
                          </div>
                          {items.map((l) => (
                            <div
                              key={l.saved.id}
                              className="wf-palette-item"
                              draggable
                              title="Kéo thả vào luồng, hoặc bấm để thêm vào cuối"
                              onDragStart={() => {
                                dragPalette.current = l.saved.id;
                                setDragKind('palette');
                              }}
                              onDragEnd={clearDrag}
                              onClick={() => addStepAt(l.saved.id, wf.steps.length)}
                            >
                              <span className={`m-tag m-${l.saved.request.method}`}>
                                {l.saved.request.method}
                              </span>
                              <span className="wf-palette-item-name">{l.saved.name}</span>
                              <span className="wf-palette-grip">⠿</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="modal-foot wf-foot">
          <label className="runner-check">
            <input
              type="checkbox"
              checked={stopOnError}
              disabled={running}
              onChange={(e) => setStopOnError(e.target.checked)}
            />
            Dừng khi lỗi
          </label>
          <label className="wf-delay">
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
          {stopped && <span className="rs err">⏹ Đã dừng</span>}
          <span className="wf-foot-spacer" />
          {done && producedList.length > 0 && onApplyVars && (
            <Button
              disabled={applied}
              onClick={() => {
                onApplyVars(producedVars);
                setApplied(true);
              }}
            >
              {applied ? '✓ Đã ghi biến' : 'Ghi biến vào môi trường'}
            </Button>
          )}
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            onClick={run}
            disabled={running || !wf || wf.steps.length === 0}
          >
            {done ? 'Chạy lại' : running ? 'Đang chạy…' : 'Chạy'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
