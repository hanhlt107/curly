import { useMemo, useState } from 'react';
import KeyValueEditor from './components/KeyValueEditor';
import ResponseView from './components/ResponseView';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import AuthPanel from './components/AuthPanel';
import EnvironmentBar from './components/EnvironmentBar';
import SaveModal from './components/SaveModal';
import { envToRecord, resolveVars, sendRequest } from './config/apiClient';
import { useStore } from './hooks/useStore';
import type {
  ApiResponse,
  Auth,
  BodyType,
  HttpMethod,
  RequestError,
} from './types/request';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
type ReqTab = 'params' | 'auth' | 'headers' | 'body';

export default function App() {
  const store = useStore();
  const [reqTab, setReqTab] = useState<ReqTab>('params');
  const [saveOpen, setSaveOpen] = useState(false);

  // response state per tab
  const [respByTab, setRespByTab] = useState<
    Record<string, { loading: boolean; response: ApiResponse | null; error: RequestError | null }>
  >({});

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
    setState(tab.id, { loading: true, error: null, response: null });
    try {
      const res = await sendRequest(req, vars);
      setState(tab.id, { loading: false, response: res });
      store.addHistory(req, res.status);
    } catch (err) {
      setState(tab.id, { loading: false, error: err as RequestError });
      store.addHistory(req);
    }
  };

  const resolvedUrl = req.url ? resolveVars(req.url, vars) : '';
  const urlHasVar = /\{\{[\w.-]+\}\}/.test(req.url);

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
          onDeleteCollection={store.deleteCollection}
          onDeleteSaved={store.deleteSaved}
          onClearHistory={store.clearHistory}
        />

        <main className="main">
          <TabBar
            tabs={store.tabs}
            activeTabId={store.activeTabId}
            onSelect={store.setActiveTabId}
            onClose={store.closeTab}
            onNew={() => store.openTab()}
          />

          <div className="url-bar">
            <select
              className={`method-select m-${req.method}`}
              value={req.method}
              onChange={(e) => store.updateActiveRequest({ method: e.target.value as HttpMethod })}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
                  {(['none', 'json', 'raw'] as BodyType[]).map((bt) => (
                    <label key={bt}>
                      <input
                        type="radio"
                        name="bodyType"
                        checked={req.bodyType === bt}
                        onChange={() => store.updateActiveRequest({ bodyType: bt })}
                      />
                      {bt === 'none' ? 'none' : bt.toUpperCase()}
                    </label>
                  ))}
                </div>
                {req.bodyType !== 'none' && (
                  <textarea
                    className="body-input"
                    value={req.body}
                    placeholder={req.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'raw body'}
                    onChange={(e) => store.updateActiveRequest({ body: e.target.value })}
                    spellCheck={false}
                  />
                )}
              </div>
            )}
          </div>

          <ResponseView loading={state.loading} response={state.response} error={state.error} />
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
    </div>
  );
}
