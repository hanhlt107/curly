import { useEffect, useMemo, useRef, useState } from 'react';
import KeyValueEditor from './components/KeyValueEditor';
import ResponseView from './components/ResponseView';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import AuthPanel from './components/AuthPanel';
import EnvironmentBar from './components/EnvironmentBar';
import MethodSelect from './components/MethodSelect';
import CodeModal from './components/CodeModal';
import CommandPalette, { type Command } from './components/CommandPalette';
import { runTests, TEST_PLACEHOLDER, type TestResult } from './config/tests';
import { buildExport, parseWorkspace } from './config/workspace';
import { buildShareLink, readSharedRequest } from './config/share';
import { toCurl } from './config/curl';
import RunnerModal from './components/RunnerModal';
import SaveModal from './components/SaveModal';
import { envToRecord, resolveVars, sendRequest } from './config/apiClient';
import {
  POST_SCRIPT_PLACEHOLDER,
  SCRIPT_PLACEHOLDER,
  runPostScript,
  runPreScript,
} from './config/script';
import { useStore } from './hooks/useStore';
import type {
  ApiResponse,
  Auth,
  BodyType,
  HttpMethod,
  RequestError,
} from './types/request';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
type ReqTab = 'params' | 'auth' | 'headers' | 'body' | 'tests' | 'script';

export default function App() {
  const store = useStore();
  const [reqTab, setReqTab] = useState<ReqTab>('params');
  const [saveOpen, setSaveOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [showCurl, setShowCurl] = useState(false);
  const [shared, setShared] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('curly:theme') as 'dark' | 'light') || 'dark',
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('curly:theme', theme);
  }, [theme]);

  type RespState = {
    loading: boolean;
    response: ApiResponse | null;
    prevResponse?: ApiResponse | null;
    error: RequestError | null;
    tests?: TestResult[];
    logs?: string[];
  };
  const RESP_KEY = 'curly:responses:v1';
  const [respByTab, setRespByTab] = useState<Record<string, RespState>>(() => {
    try {
      const raw = localStorage.getItem(RESP_KEY);
      return raw ? (JSON.parse(raw) as Record<string, RespState>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const persistable: Record<string, RespState> = {};
    for (const [id, s] of Object.entries(respByTab)) {
      if (s.response || s.error) {
        persistable[id] = { ...s, loading: false };
      }
    }
    try {
      localStorage.setItem(RESP_KEY, JSON.stringify(persistable));
    } catch {
      /* quota exceeded — bỏ qua */
    }
  }, [respByTab]);

  const tab = store.activeTab;
  const req = tab.request;
  const state = respByTab[tab.id] ?? { loading: false, response: null, error: null };

  const vars = useMemo(
    () => (store.activeEnv ? envToRecord(store.activeEnv.variables) : {}),
    [store.activeEnv],
  );

  const activeParams = req.params.filter((p) => p.enabled && p.key.trim()).length;
  const activeHeaders = req.headers.filter((h) => h.enabled && h.key.trim()).length;

  const setState = (id: string, patch: Partial<(typeof respByTab)[string]>) =>
    setRespByTab((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { loading: false, response: null, error: null }), ...patch },
    }));

  const send = async () => {
    if (!req.url.trim()) {
      setState(tab.id, { error: { message: 'Chưa nhập URL' }, response: null });
      return;
    }
    const prevResponse = respByTab[tab.id]?.response ?? null;
    setState(tab.id, { loading: true, error: null, response: null, tests: undefined, logs: undefined });

    let workVars = { ...vars };
    const logs: string[] = [];
    if (req.preScript.trim()) {
      const pre = runPreScript(req.preScript, workVars);
      workVars = pre.vars;
      logs.push(...pre.logs);
      if (pre.error) {
        setState(tab.id, {
          loading: false,
          error: { message: 'Lỗi pre-request script', detail: pre.error },
          logs,
        });
        return;
      }
    }

    try {
      const res = await sendRequest(req, workVars);
      if (req.postScript.trim()) {
        const post = runPostScript(req.postScript, workVars, res);
        workVars = post.vars;
        logs.push(...post.logs);
        if (post.error) logs.push('⚠ post-script: ' + post.error);
      }
      store.applyVars(workVars);
      const tests = req.tests.trim() ? runTests(req.tests, res) : undefined;
      setState(tab.id, {
        loading: false,
        response: res,
        prevResponse,
        tests,
        logs: logs.length ? logs : undefined,
      });
      store.addHistory(req, res.status);
    } catch (err) {
      setState(tab.id, { loading: false, error: err as RequestError, logs: logs.length ? logs : undefined });
      store.addHistory(req);
    }
  };

  const resolvedUrl = req.url ? resolveVars(req.url, vars) : '';
  const urlHasVar = /\{\{[\w.-]+\}\}/.test(req.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const r = readSharedRequest();
    if (r) {
      store.openRequest(r, r.url || 'Shared');
      history.replaceState(null, '', location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareRequest = () => {
    const link = buildShareLink(req);
    navigator.clipboard?.writeText(link);
    setShared(true);
    setTimeout(() => setShared(false), 1600);
  };

  const curlPreview = useMemo(() => toCurl(req), [req]);

  const copyCurl = () => {
    navigator.clipboard?.writeText(curlPreview);
  };

  const exportWorkspace = () => {
    const data = buildExport(store.collections, store.environments);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curly-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { collections, environments } = parseWorkspace(String(reader.result));
        store.importWorkspace(collections, environments);
      } catch (err) {
        alert((err as Error).message || 'Không đọc được file.');
      }
    };
    reader.readAsText(file);
  };

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: 'new-tab', group: 'Lệnh', label: 'Tab mới', hint: 'New', run: () => store.openTab() },
      { id: 'save', group: 'Lệnh', label: 'Lưu request', hint: 'Save', run: () => setSaveOpen(true) },
      { id: 'code', group: 'Lệnh', label: 'Import cURL / Code snippet', run: () => setCodeOpen(true) },
      { id: 'export', group: 'Lệnh', label: 'Export workspace', run: exportWorkspace },
      { id: 'import', group: 'Lệnh', label: 'Import workspace / Postman', run: () => fileRef.current?.click() },
      {
        id: 'no-env',
        group: 'Environment',
        label: 'No Environment',
        run: () => store.setActiveEnvId(null),
      },
    ];
    for (const c of store.collections) {
      for (const r of c.requests) {
        list.push({
          id: `req-${r.id}`,
          group: c.name,
          label: r.name,
          hint: r.request.method,
          run: () => store.openSaved(r),
        });
      }
    }
    for (const e of store.environments) {
      list.push({
        id: `env-${e.id}`,
        group: 'Environment',
        label: e.name,
        run: () => store.setActiveEnvId(e.id),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.collections, store.environments]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>curly</h1>
        <EnvironmentBar
          environments={store.environments}
          activeEnvId={store.activeEnvId}
          onSelect={store.setActiveEnvId}
          onAdd={store.addEnvironment}
          onUpdate={store.updateEnvironment}
          onDelete={store.deleteEnvironment}
        />
        <div className="topbar-actions">
          <button className="ghost-btn sm" onClick={() => setPaletteOpen(true)} title="Ctrl/⌘ + K">
            <span className="kbd">⌘K</span> Tìm nhanh
          </button>
          <button
            className="ghost-btn sm"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="ghost-btn sm" onClick={exportWorkspace} title="Export ra file JSON">
            ↥ Export
          </button>
          <button className="ghost-btn sm" onClick={() => fileRef.current?.click()} title="Import Curly / Postman">
            ↧ Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="layout">
        <Sidebar
          collections={store.collections}
          history={store.history}
          onOpenSaved={store.openSaved}
          onOpenHistory={(h) =>
            store.openTab({
              id: crypto.randomUUID(),
              name: h.url || 'History',
              request: structuredClone(h.request),
              dirty: false,
            })
          }
          onAddCollection={store.addCollection}
          onRenameCollection={store.renameCollection}
          onRunCollection={setRunnerId}
          onDeleteCollection={store.deleteCollection}
          onDeleteSaved={store.deleteSaved}
          onClearHistory={store.clearHistory}
        />

        <main className="main">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            onSelect={store.setActiveTabId}
            onClose={(id) => {
              store.closeTab(id);
              setRespByTab((prev) => {
                const { [id]: _removed, ...rest } = prev;
                return rest;
              });
            }}
            onNew={() => store.openTab()}
          />

          <div className="url-bar">
            <MethodSelect
              methods={METHODS}
              value={req.method}
              onChange={(m) => store.updateActiveRequest({ method: m })}
            />
            <div className="url-wrap">
              <input
                className="url-input"
                value={req.url}
                placeholder="https://api.example.com/endpoint  hoặc  {{baseUrl}}/users"
                onChange={(e) => store.updateActiveRequest({ url: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              {urlHasVar && resolvedUrl !== req.url && (
                <span className="url-preview" title="URL sau khi thay biến">
                  → {resolvedUrl}
                </span>
              )}
            </div>
            <button className="send-btn" onClick={send} disabled={state.loading}>
              {state.loading ? <span className="btn-spinner" /> : 'Send'}
            </button>
            <button className="save-btn" onClick={() => setSaveOpen(true)} title="Lưu vào collection">
              Save
            </button>
            <button
              className="code-btn"
              onClick={() => setCodeOpen(true)}
              title="Import cURL / xuất code snippet"
            >
              &lt;/&gt;
            </button>
            <button
              className="code-btn share-btn"
              onClick={shareRequest}
              title="Copy link chia sẻ request"
            >
              {shared ? '✓' : '🔗'}
            </button>
          </div>

          <div className={`curl-strip ${showCurl ? 'open' : ''}`}>
            <button className="curl-toggle" onClick={() => setShowCurl((v) => !v)}>
              <span className={`caret ${showCurl ? 'open' : ''}`}>▸</span> cURL
            </button>
            {showCurl && (
              <div className="curl-live">
                <pre>{curlPreview}</pre>
                <button className="copy-btn" onClick={copyCurl}>
                  Copy
                </button>
              </div>
            )}
          </div>

          <div className="req-tabs">
            <button className={reqTab === 'params' ? 'active' : ''} onClick={() => setReqTab('params')}>
              Params{activeParams ? <span className="pill">{activeParams}</span> : null}
            </button>
            <button className={reqTab === 'auth' ? 'active' : ''} onClick={() => setReqTab('auth')}>
              Auth{req.auth.type !== 'none' ? <span className="pill dot-pill">●</span> : null}
            </button>
            <button
              className={reqTab === 'headers' ? 'active' : ''}
              onClick={() => setReqTab('headers')}
            >
              Headers{activeHeaders ? <span className="pill">{activeHeaders}</span> : null}
            </button>
            <button className={reqTab === 'body' ? 'active' : ''} onClick={() => setReqTab('body')}>
              Body{req.bodyType !== 'none' ? <span className="pill dot-pill">●</span> : null}
            </button>
            <button className={reqTab === 'tests' ? 'active' : ''} onClick={() => setReqTab('tests')}>
              Tests{req.tests.trim() ? <span className="pill dot-pill">●</span> : null}
            </button>
            <button className={reqTab === 'script' ? 'active' : ''} onClick={() => setReqTab('script')}>
              Script
              {req.preScript.trim() || req.postScript.trim() ? (
                <span className="pill dot-pill">●</span>
              ) : null}
            </button>
          </div>

          <div className="req-panel">
            {reqTab === 'params' && (
              <KeyValueEditor
                items={req.params}
                onChange={(params) => store.updateActiveRequest({ params })}
                keyPlaceholder="Param"
              />
            )}
            {reqTab === 'auth' && (
              <AuthPanel
                auth={req.auth}
                onChange={(patch: Partial<Auth>) =>
                  store.updateActiveRequest({ auth: { ...req.auth, ...patch } })
                }
              />
            )}
            {reqTab === 'headers' && (
              <KeyValueEditor
                items={req.headers}
                onChange={(headers) => store.updateActiveRequest({ headers })}
                keyPlaceholder="Header"
              />
            )}
            {reqTab === 'body' && (
              <div className="body-panel">
                <div className="body-types">
                  {(
                    [
                      ['none', 'none'],
                      ['json', 'JSON'],
                      ['raw', 'Raw'],
                      ['graphql', 'GraphQL'],
                      ['form', 'Form-data'],
                      ['urlencoded', 'URL-encoded'],
                    ] as [BodyType, string][]
                  ).map(([bt, label]) => (
                    <label key={bt}>
                      <input
                        type="radio"
                        name="bodyType"
                        checked={req.bodyType === bt}
                        onChange={() =>
                          store.updateActiveRequest(
                            bt === 'graphql' && req.method === 'GET'
                              ? { bodyType: bt, method: 'POST' }
                              : { bodyType: bt },
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {(req.bodyType === 'json' || req.bodyType === 'raw') && (
                  <textarea
                    className="body-input"
                    value={req.body}
                    placeholder={req.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'raw body'}
                    onChange={(e) => store.updateActiveRequest({ body: e.target.value })}
                    spellCheck={false}
                  />
                )}

                {req.bodyType === 'graphql' && (
                  <div className="gql-panel">
                    <label className="field-label">Query</label>
                    <textarea
                      className="body-input gql-query"
                      value={req.body}
                      placeholder={'query {\n  users {\n    id\n    name\n  }\n}'}
                      onChange={(e) => store.updateActiveRequest({ body: e.target.value })}
                      spellCheck={false}
                    />
                    <label className="field-label">Variables (JSON)</label>
                    <textarea
                      className="body-input gql-vars"
                      value={req.graphqlVars}
                      placeholder={'{\n  "id": 1\n}'}
                      onChange={(e) => store.updateActiveRequest({ graphqlVars: e.target.value })}
                      spellCheck={false}
                    />
                  </div>
                )}

                {(req.bodyType === 'form' || req.bodyType === 'urlencoded') && (
                  <KeyValueEditor
                    items={req.formData}
                    onChange={(formData) => store.updateActiveRequest({ formData })}
                    keyPlaceholder="Field"
                  />
                )}
              </div>
            )}
            {reqTab === 'tests' && (
              <div className="tests-panel">
                <div className="tests-hint">
                  Mỗi dòng một assertion. Cú pháp: <code>status === 200</code>,{' '}
                  <code>status &lt; 400</code>, <code>time &lt; 2000</code>,{' '}
                  <code>body contains "id"</code>, <code>body matches /regex/</code>,{' '}
                  <code>header content-type contains json</code>, <code>json data.id === 1</code>,{' '}
                  <code>json data.count &gt; 0</code>
                </div>
                <textarea
                  className="body-input tests-input"
                  value={req.tests}
                  placeholder={TEST_PLACEHOLDER}
                  onChange={(e) => store.updateActiveRequest({ tests: e.target.value })}
                  spellCheck={false}
                />
              </div>
            )}
            {reqTab === 'script' && (
              <div className="script-panel">
                {!store.activeEnv && (
                  <div className="tests-hint">
                    Chưa chọn Environment — biến <code>curly.set(...)</code> sẽ không được lưu.
                  </div>
                )}
                <label className="field-label">Pre-request (chạy trước khi gửi)</label>
                <textarea
                  className="body-input script-input"
                  value={req.preScript}
                  placeholder={SCRIPT_PLACEHOLDER}
                  onChange={(e) => store.updateActiveRequest({ preScript: e.target.value })}
                  spellCheck={false}
                />
                <label className="field-label">Post-response (chạy sau khi nhận)</label>
                <textarea
                  className="body-input script-input"
                  value={req.postScript}
                  placeholder={POST_SCRIPT_PLACEHOLDER}
                  onChange={(e) => store.updateActiveRequest({ postScript: e.target.value })}
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          <ResponseView
            loading={state.loading}
            response={state.response}
            prevResponse={state.prevResponse ?? null}
            error={state.error}
            tests={state.tests}
            logs={state.logs}
          />
        </main>
      </div>

      {saveOpen && (
        <SaveModal
          defaultName={tab.name === 'Request mới' ? req.url : tab.name}
          collections={store.collections}
          onCreateCollection={store.addCollection}
          onSave={(cid, name) => store.saveTabToCollection(tab.id, cid, name)}
          onClose={() => setSaveOpen(false)}
        />
      )}

      {codeOpen && (
        <CodeModal
          request={req}
          onImport={(r) => store.openRequest(r, r.url || 'Imported')}
          onClose={() => setCodeOpen(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}

      {runnerId &&
        (() => {
          const col = store.collections.find((c) => c.id === runnerId);
          return col ? (
            <RunnerModal
              collection={col}
              vars={vars}
              onApplyVars={store.applyVars}
              onClose={() => setRunnerId(null)}
            />
          ) : null;
        })()}
    </div>
  );
}
