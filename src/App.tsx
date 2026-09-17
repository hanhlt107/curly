import { useMemo, useRef, useState } from 'react';
import Button from './components/Button';
import KebabMenu from './components/KebabMenu';
import KeyValueEditor from './components/KeyValueEditor';
import ResponseView from './components/ResponseView';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import AuthPanel from './components/AuthPanel';
import EnvironmentModal from './components/EnvironmentModal';
import SettingsMenu from './components/SettingsMenu';
import MethodSelect from './components/MethodSelect';
import ProtocolSelect from './components/ProtocolSelect';
import CodeModal from './components/CodeModal';
import CommandPalette from './components/CommandPalette';
import { runTests, TEST_PLACEHOLDER } from './config/tests';
import { findRequestFolderId } from './config/collections';
import { useModals } from './hooks/useModals';
import { useResponses } from './hooks/useResponses';
import { useWorkspaceIO } from './hooks/useWorkspaceIO';
import { buildCommands } from './config/commands';
import { toCurl } from './config/curl';
import RunnerModal from './components/RunnerModal';
import SaveModal from './components/SaveModal';
import AuthModal from './components/AuthModal';
import RealtimePanel from './components/RealtimePanel';
import CookieJarModal from './components/CookieJarModal';
import MockManagerModal from './components/MockManagerModal';
import MultiEnvModal from './components/MultiEnvModal';
import WorkflowModal from './components/WorkflowModal';
import DocsModal from './components/DocsModal';
import DynamicVarsModal from './components/DynamicVarsModal';
import P2PShareModal from './components/P2PShareModal';
import LiveShareModal from './components/LiveShareModal';
import { buildSharedWorkspace } from './config/p2p';
import GraphQLPanel from './components/GraphQLPanel';
import InstallButton from './components/InstallButton';
import { snapshotFromResponse } from './config/snapshot';
import { useHotkeys } from './hooks/useHotkeys';
import { useDialogs } from './hooks/useDialogs';
import { matchMock, mockFromResponse, runMock } from './config/mocks';
import { SCHEMA_PLACEHOLDER, validateSchema } from './config/schema';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { envToRecord, findUnresolvedVars, resolveVars, sendRequest } from './config/apiClient';
import {
  POST_SCRIPT_PLACEHOLDER,
  SCRIPT_PLACEHOLDER,
  autoExtractToken,
  runPostScript,
  runPreScript,
} from './config/script';
import { useStore } from './hooks/useStore';
import type {
  Auth,
  BodyType,
  HttpMethod,
  Protocol,
  RequestError,
  SnapshotMode,
} from './types/request';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'ws', label: 'WS' },
  { value: 'sse', label: 'SSE' },
];
type ReqTab = 'params' | 'auth' | 'headers' | 'body' | 'tests' | 'script';

export default function App() {
  const store = useStore();
  const dialogs = useDialogs();
  const auth = useAuth();
  const sync = useCloudSync({
    userId: auth.user?.id ?? null,
    collections: store.collections,
    environments: store.environments,
    onPull: store.replaceWorkspace,
  });
  const modals = useModals();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reqTab, setReqTab] = useState<ReqTab>('params');
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [docsId, setDocsId] = useState<string | null>(null);
  const [showCurl, setShowCurl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const { respByTab, setResp, clearResp, getResp } = useResponses();
  const io = useWorkspaceIO(store, dialogs);

  const tab = store.activeTab;
  const req = tab.request;
  const state = getResp(tab.id);

  const vars = useMemo(
    () => ({
      ...envToRecord(store.globals),
      ...(store.activeEnv ? envToRecord(store.activeEnv.variables) : {}),
    }),
    [store.globals, store.activeEnv],
  );

  const activeParams = req.params.filter((p) => p.enabled && p.key.trim()).length;
  const activeHeaders = req.headers.filter((h) => h.enabled && h.key.trim()).length;

  const send = async () => {
    if (!req.url.trim()) {
      setResp(tab.id, { error: { message: 'Chưa nhập URL' }, response: null });
      return;
    }
    const prevResponse = respByTab[tab.id]?.response ?? null;
    setResp(tab.id, {
      loading: true,
      error: null,
      response: null,
      tests: undefined,
      schema: undefined,
      logs: undefined,
    });

    let workVars = { ...vars };
    const logs: string[] = [];
    if (req.preScript.trim()) {
      const pre = runPreScript(req.preScript, workVars);
      workVars = pre.vars;
      logs.push(...pre.logs);
      if (pre.error) {
        setResp(tab.id, {
          loading: false,
          error: { message: 'Lỗi pre-request script', detail: pre.error },
          logs,
        });
        return;
      }
    }

    try {
      const mockRule = store.mockMode ? matchMock(req, store.mocks, workVars) : null;
      const res = mockRule
        ? await runMock(mockRule, workVars)
        : await sendRequest(req, workVars, store.cookieJarEnabled ? store.cookies : []);
      if (mockRule)
        logs.push(`🎭 mock: "${mockRule.name}" (${mockRule.method} ${mockRule.urlPattern})`);
      if (req.autoToken) {
        const auto = autoExtractToken(workVars, res);
        workVars = auto.vars;
        logs.push(...auto.logs);
      }
      if (req.postScript.trim()) {
        const post = runPostScript(req.postScript, workVars, res);
        workVars = post.vars;
        logs.push(...post.logs);
        if (post.error) logs.push('⚠ post-script: ' + post.error);
      }
      store.applyVars(workVars);
      const tests = req.tests.trim() ? runTests(req.tests, res) : undefined;
      const schema = req.responseSchema.trim()
        ? validateSchema(req.responseSchema, res.data)
        : undefined;
      setResp(tab.id, {
        loading: false,
        response: res,
        prevResponse,
        tests,
        schema,
        logs: logs.length ? logs : undefined,
      });
      store.addHistory(req, res);
    } catch (err) {
      setResp(tab.id, {
        loading: false,
        error: err as RequestError,
        logs: logs.length ? logs : undefined,
      });
      store.addHistory(req);
    }
  };

  const resolvedUrl = req.url ? resolveVars(req.url, vars) : '';
  const urlHasVar = /\{\{[\w.-]+\}\}/.test(req.url);
  const unresolvedVars = useMemo(() => findUnresolvedVars(req, vars), [req, vars]);

  const closeTabWithState = (id: string) => {
    store.closeTab(id);
    clearResp(id);
  };

  const stepTab = (delta: number) => {
    const list = store.tabs;
    if (list.length < 2) return;
    const idx = list.findIndex((t) => t.id === store.activeTabId);
    const next = (idx + delta + list.length) % list.length;
    store.setActiveTabId(list[next].id);
  };

  useHotkeys({
    onSend: () => {
      if (req.protocol === 'http') send();
    },
    onSave: () => modals.open('save'),
    onPalette: () => modals.toggle('palette'),
    onNewTab: () => store.openTab(),
    onCloseTab: () => closeTabWithState(store.activeTabId),
    onNextTab: () => stepTab(1),
    onPrevTab: () => stepTab(-1),
    onToggleSidebar: () => setSidebarOpen((o) => !o),
    onFocusUrl: () => urlRef.current?.focus(),
  });

  const saveSnapshot = () => {
    const res = respByTab[tab.id]?.response;
    if (!res) return;
    const mode = req.snapshot?.mode ?? 'strict';
    store.updateActiveRequest({ snapshot: snapshotFromResponse(res, mode) });
  };

  const clearSnapshot = () => store.updateActiveRequest({ snapshot: null });

  const setSnapshotMode = (mode: SnapshotMode) => {
    if (req.snapshot) store.updateActiveRequest({ snapshot: { ...req.snapshot, mode } });
  };

  const syncLabel = useMemo(() => {
    switch (sync.status) {
      case 'pulling':
        return 'Đang tải từ cloud…';
      case 'saving':
        return 'Đang lưu…';
      case 'synced':
        return sync.lastSyncedAt
          ? `Đã đồng bộ · ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
          : 'Đã đồng bộ';
      case 'error':
        return 'Lỗi đồng bộ';
      default:
        return 'Chưa đồng bộ';
    }
  }, [sync.status, sync.lastSyncedAt]);

  const curlPreview = useMemo(() => toCurl(req), [req]);

  const copyCurl = () => {
    navigator.clipboard?.writeText(curlPreview);
  };

  const saveResponseAsMock = async () => {
    const res = respByTab[tab.id]?.response;
    if (!res) return;
    const mock = mockFromResponse(req, res, vars);
    store.addMock(mock);
    dialogs.toast(`Đã lưu response thành mock: ${mock.method} ${mock.urlPattern}`, 'success');
    const open = await dialogs.confirm({
      title: 'Mock đã được tạo',
      message: 'Mở trình quản lý Mock để xem hoặc chỉnh sửa rule vừa tạo?',
      confirmLabel: 'Mở Mock manager',
      cancelLabel: 'Để sau',
    });
    if (open) modals.open('mock');
  };

  const commands = useMemo(
    () =>
      buildCommands(
        {
          collections: store.collections,
          environments: store.environments,
          mockMode: store.mockMode,
        },
        {
          newTab: () => store.openTab(),
          openSave: () => modals.open('save'),
          openCode: () => modals.open('code'),
          openCookies: () => modals.open('cookie'),
          openMock: () => modals.open('mock'),
          toggleMockMode: () => store.setMockMode((v) => !v),
          exportWorkspace: io.exportWorkspace,
          exportTestsAsCode: io.exportTestsAsCode,
          importFile: () => fileRef.current?.click(),
          setActiveEnvId: store.setActiveEnvId,
          openDocs: (id) => setDocsId(id),
          openSaved: store.openSaved,
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.collections, store.environments, store.mockMode],
  );

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Mở/đóng danh sách collection"
          aria-expanded={sidebarOpen}
        >
          ☰
        </button>
        <h1>
          <img
            src={`${import.meta.env.BASE_URL}curly-mark.svg`}
            alt=""
            width={26}
            height={26}
            className="topbar-logo"
          />
          curly
        </h1>
        <div className="topbar-actions">
          <InstallButton />
          <Button
            size="sm"
            onClick={() => modals.open('workflow')}
            title="Nối nhiều request thành chuỗi"
          >
            ⚡ Workflow
          </Button>
          <Button size="sm" onClick={() => modals.open('palette')} title="Ctrl/⌘ + K">
            <span className="kbd">⌘K</span> Tìm nhanh
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.http,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) io.importFile(f);
              e.target.value = '';
            }}
          />
          <SettingsMenu
            cookiesCount={store.cookies.length}
            onOpenCookies={() => modals.open('cookie')}
            mockMode={store.mockMode}
            mocksCount={store.mocks.length}
            onOpenMock={() => modals.open('mock')}
            onExport={io.exportWorkspace}
            onExportCode={io.exportTestsAsCode}
            onImport={() => fileRef.current?.click()}
            onOpenShare={() => modals.open('share')}
            onOpenLive={() => modals.open('live')}
            environments={store.environments}
            activeEnvId={store.activeEnvId}
            onSelectEnv={store.setActiveEnvId}
            onManageEnv={() => modals.open('env')}
            authEnabled={auth.enabled}
            authEmail={auth.user?.email ?? null}
            syncStatus={sync.status}
            syncLabel={syncLabel}
            onSignIn={() => modals.open('auth')}
            onSignOut={auth.signOut}
          />
        </div>
      </header>

      <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <Sidebar
          collections={store.collections}
          history={store.history}
          historyLimit={store.historyLimit}
          onChangeHistoryLimit={store.setHistoryLimit}
          onOpenSaved={(s) => {
            store.openSaved(s);
            setSidebarOpen(false);
          }}
          onOpenHistory={(h) => {
            const newId = crypto.randomUUID();
            store.openTab({
              id: newId,
              name: h.url || 'History',
              request: structuredClone(h.request),
              dirty: false,
            });
            if (h.response) {
              setResp(newId, { loading: false, response: h.response, error: null });
            }
            setSidebarOpen(false);
          }}
          onAddCollection={store.addCollection}
          onRenameCollection={store.renameCollection}
          onRunCollection={setRunnerId}
          onDocsCollection={setDocsId}
          onExportCollection={io.exportCollectionAsPostman}
          onDeleteCollection={store.deleteCollection}
          onDeleteSaved={store.deleteSaved}
          onDuplicateSaved={store.duplicateSaved}
          onMoveSavedTo={store.moveSavedTo}
          onMoveFolderTo={store.moveFolderTo}
          onAddFolder={store.addFolder}
          onRenameFolder={store.renameFolder}
          onDeleteFolder={store.deleteFolder}
          onDeleteHistory={store.deleteHistoryEntry}
          onClearHistory={store.clearHistory}
        />

        <main className="main">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            onSelect={store.setActiveTabId}
            onClose={closeTabWithState}
            onNew={() => store.openTab()}
          />

          <div className="url-bar">
            <ProtocolSelect
              protocols={PROTOCOLS}
              value={req.protocol}
              onChange={(protocol) => store.updateActiveRequest({ protocol })}
            />
            {req.protocol === 'http' && (
              <MethodSelect
                methods={METHODS}
                value={req.method}
                onChange={(m) => store.updateActiveRequest({ method: m })}
              />
            )}
            <div className="url-wrap">
              <input
                ref={urlRef}
                className="url-input"
                value={req.url}
                placeholder={
                  req.protocol === 'ws'
                    ? 'wss://echo.websocket.org  hoặc  {{wsUrl}}'
                    : req.protocol === 'sse'
                      ? 'https://api.example.com/stream  hoặc  {{baseUrl}}/events'
                      : 'https://api.example.com/endpoint  hoặc  {{baseUrl}}/users'
                }
                onChange={(e) => store.updateActiveRequest({ url: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && req.protocol === 'http' && send()}
              />
              {urlHasVar && resolvedUrl !== req.url && (
                <span className="url-preview" title="URL sau khi thay biến">
                  → {resolvedUrl}
                </span>
              )}
            </div>
            {req.protocol === 'http' && (
              <Button
                variant="primary"
                className="url-send"
                onClick={send}
                disabled={state.loading}
              >
                {state.loading ? <span className="btn-spinner" /> : 'Send'}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => modals.open('save')}
              title="Lưu vào collection"
            >
              Save
            </Button>
            <KebabMenu
              className="url-tools"
              title="Công cụ khác"
              items={[
                {
                  icon: '</>',
                  label: 'Code / cURL',
                  title: 'Import cURL / xuất code snippet',
                  onClick: () => modals.open('code'),
                },
                {
                  icon: '{{$}}',
                  label: 'Biến động',
                  title: 'Biến động: {{$uuid}}, {{$timestamp}}…',
                  onClick: () => modals.open('dynVars'),
                },
                ...(req.protocol === 'http'
                  ? [
                      {
                        icon: '🌐',
                        label: 'So sánh môi trường',
                        title: 'Chạy request này trên mọi môi trường và so sánh',
                        disabled: !req.url.trim() || store.environments.length === 0,
                        onClick: () => modals.open('multiEnv'),
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          {unresolvedVars.length > 0 && (
            <div className="var-warn" title="Các biến này chưa có trong environment đang chọn">
              <span className="var-warn-icon">⚠</span>
              Biến chưa định nghĩa:{' '}
              {unresolvedVars.map((v) => (
                <code key={v}>{`{{${v}}}`}</code>
              ))}
              {store.activeEnv ? '' : ' — chưa chọn environment nào'}
            </div>
          )}

          {req.protocol !== 'http' ? (
            <RealtimePanel key={tab.id} protocol={req.protocol} url={req.url} vars={vars} />
          ) : (
            <>
              <div className={`curl-strip ${showCurl ? 'open' : ''}`}>
                <button className="curl-toggle" onClick={() => setShowCurl((v) => !v)}>
                  <span className={`curl-caret ${showCurl ? 'open' : ''}`}>▶</span> cURL
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
                <button
                  className={reqTab === 'params' ? 'active' : ''}
                  onClick={() => setReqTab('params')}
                >
                  Params{activeParams ? <span className="pill">{activeParams}</span> : null}
                </button>
                <button
                  className={reqTab === 'auth' ? 'active' : ''}
                  onClick={() => setReqTab('auth')}
                >
                  Auth{req.auth.type !== 'none' ? <span className="pill dot-pill">●</span> : null}
                </button>
                <button
                  className={reqTab === 'headers' ? 'active' : ''}
                  onClick={() => setReqTab('headers')}
                >
                  Headers{activeHeaders ? <span className="pill">{activeHeaders}</span> : null}
                </button>
                <button
                  className={reqTab === 'body' ? 'active' : ''}
                  onClick={() => setReqTab('body')}
                >
                  Body{req.bodyType !== 'none' ? <span className="pill dot-pill">●</span> : null}
                </button>
                <button
                  className={reqTab === 'tests' ? 'active' : ''}
                  onClick={() => setReqTab('tests')}
                >
                  Tests{req.tests.trim() ? <span className="pill dot-pill">●</span> : null}
                </button>
                <button
                  className={reqTab === 'script' ? 'active' : ''}
                  onClick={() => setReqTab('script')}
                >
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
                    autoToken={req.autoToken ?? false}
                    onAutoTokenChange={(autoToken) => store.updateActiveRequest({ autoToken })}
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
                        placeholder={
                          req.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'raw body'
                        }
                        onChange={(e) => store.updateActiveRequest({ body: e.target.value })}
                        spellCheck={false}
                      />
                    )}

                    {req.bodyType === 'graphql' && (
                      <GraphQLPanel
                        req={req}
                        vars={vars}
                        cookies={store.cookieJarEnabled ? store.cookies : []}
                        onBodyChange={(body) => store.updateActiveRequest({ body })}
                        onVarsChange={(graphqlVars) => store.updateActiveRequest({ graphqlVars })}
                      />
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
                      <code>header content-type contains json</code>,{' '}
                      <code>json data.id === 1</code>, <code>json data.count &gt; 0</code>
                    </div>
                    <textarea
                      className="body-input tests-input"
                      value={req.tests}
                      placeholder={TEST_PLACEHOLDER}
                      onChange={(e) => store.updateActiveRequest({ tests: e.target.value })}
                      spellCheck={false}
                    />
                    <label className="field-label">
                      JSON Schema{' '}
                      {req.responseSchema.trim() ? <span className="pill dot-pill">●</span> : null}
                    </label>
                    <div className="tests-hint">
                      Kiểm tra response body theo JSON Schema. Hỗ trợ <code>type</code>,{' '}
                      <code>required</code>, <code>properties</code>, <code>items</code>,{' '}
                      <code>enum</code>, <code>minimum/maximum</code>,{' '}
                      <code>minLength/maxLength</code>, <code>additionalProperties</code>.
                    </div>
                    <textarea
                      className="body-input tests-input"
                      value={req.responseSchema}
                      placeholder={SCHEMA_PLACEHOLDER}
                      onChange={(e) =>
                        store.updateActiveRequest({ responseSchema: e.target.value })
                      }
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
                schema={state.schema}
                logs={state.logs}
                snapshot={req.snapshot ?? null}
                onSaveSnapshot={saveSnapshot}
                onClearSnapshot={clearSnapshot}
                onSetSnapshotMode={setSnapshotMode}
                onSaveAsMock={state.response ? saveResponseAsMock : undefined}
              />
            </>
          )}
        </main>
      </div>

      {modals.isOpen('save') &&
        (() => {
          const existingCol = tab.savedRequestId
            ? store.collections.find(
                (c) => findRequestFolderId(c, tab.savedRequestId!) !== undefined,
              )
            : undefined;
          const existingFolderId = existingCol
            ? (findRequestFolderId(existingCol, tab.savedRequestId!) ?? null)
            : null;
          return (
            <SaveModal
              defaultName={tab.name === 'Request mới' ? req.url : tab.name}
              collections={store.collections}
              defaultCollectionId={existingCol?.id ?? null}
              defaultFolderId={existingFolderId}
              onCreateCollection={store.addCollection}
              onSave={(cid, folderId, name) =>
                store.saveTabToCollection(tab.id, cid, folderId, name)
              }
              onClose={() => modals.close('save')}
            />
          );
        })()}

      {modals.isOpen('code') && (
        <CodeModal
          request={req}
          onImport={(r) => store.openRequest(r, r.url || 'Imported')}
          onImportSpec={io.importOpenApiSpec}
          onImportHar={io.importHar}
          onClose={() => modals.close('code')}
        />
      )}

      {modals.isOpen('cookie') && (
        <CookieJarModal
          cookies={store.cookies}
          enabled={store.cookieJarEnabled}
          onToggleEnabled={store.setCookieJarEnabled}
          onAdd={store.addCookie}
          onUpdate={store.updateCookie}
          onDelete={store.deleteCookie}
          onClearAll={store.clearCookies}
          onClose={() => modals.close('cookie')}
        />
      )}

      {modals.isOpen('mock') && (
        <MockManagerModal
          mocks={store.mocks}
          mockMode={store.mockMode}
          onToggleMode={store.setMockMode}
          onAdd={store.addMock}
          onUpdate={store.updateMock}
          onDelete={store.deleteMock}
          onClose={() => modals.close('mock')}
        />
      )}

      {modals.isOpen('env') && (
        <EnvironmentModal
          environments={store.environments}
          globals={store.globals}
          activeEnvId={store.activeEnvId}
          onAdd={store.addEnvironment}
          onUpdate={store.updateEnvironment}
          onDelete={store.deleteEnvironment}
          onUpdateGlobals={store.updateGlobals}
          onExportEnv={io.exportEnvironment}
          onImportEnv={io.importEnvironmentFile}
          onImportDotenv={store.importDotenv}
          onClose={() => modals.close('env')}
        />
      )}

      {modals.isOpen('multiEnv') && (
        <MultiEnvModal
          req={req}
          environments={store.environments}
          globals={store.globals}
          cookies={store.cookieJarEnabled ? store.cookies : []}
          mockMode={store.mockMode}
          mocks={store.mocks}
          onClose={() => modals.close('multiEnv')}
        />
      )}

      {modals.isOpen('workflow') && (
        <WorkflowModal
          workflows={store.workflows}
          collections={store.collections}
          vars={vars}
          onAdd={store.addWorkflow}
          onRename={store.renameWorkflow}
          onDelete={store.deleteWorkflow}
          onUpdate={store.updateWorkflow}
          onApplyVars={store.applyVars}
          onClose={() => modals.close('workflow')}
        />
      )}

      {modals.isOpen('palette') && (
        <CommandPalette commands={commands} onClose={() => modals.close('palette')} />
      )}

      {modals.isOpen('dynVars') && (
        <DynamicVarsModal
          customVars={store.customDynVars}
          onAdd={store.addCustomDynVar}
          onUpdate={store.updateCustomDynVar}
          onDelete={store.deleteCustomDynVar}
          onClose={() => modals.close('dynVars')}
        />
      )}

      {modals.isOpen('share') && (
        <P2PShareModal
          getWorkspace={() =>
            buildSharedWorkspace(store.collections, store.environments, store.globals)
          }
          onReceive={io.receiveSharedWorkspace}
          onClose={() => modals.close('share')}
        />
      )}

      {modals.isOpen('live') && (
        <LiveShareModal
          request={store.activeTab.request}
          onPatch={store.updateActiveRequest}
          onClose={() => modals.close('live')}
        />
      )}

      {modals.isOpen('auth') && <AuthModal auth={auth} onClose={() => modals.close('auth')} />}

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

      {docsId &&
        (() => {
          const col = store.collections.find((c) => c.id === docsId);
          return col ? (
            <DocsModal collection={col} history={store.history} onClose={() => setDocsId(null)} />
          ) : null;
        })()}
    </div>
  );
}
