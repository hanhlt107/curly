import { useState } from 'react';
import KeyValueEditor, { newRow } from './components/KeyValueEditor';
import ResponseView from './components/ResponseView';
import HistoryPanel from './components/HistoryPanel';
import { sendRequest } from './config/apiClient';
import { useHistory } from './hooks/useHistory';
import type {
  ApiRequest,
  ApiResponse,
  BodyType,
  HistoryEntry,
  HttpMethod,
  RequestError,
} from './types/request';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
type Tab = 'params' | 'headers' | 'body';

const emptyRequest: ApiRequest = {
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/todos/1',
  params: [newRow()],
  headers: [newRow()],
  bodyType: 'none',
  body: '',
};

export default function App() {
  const [req, setReq] = useState<ApiRequest>(emptyRequest);
  const [tab, setTab] = useState<Tab>('params');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<RequestError | null>(null);
  const { history, add, clear } = useHistory();

  const patch = (p: Partial<ApiRequest>) => setReq((prev) => ({ ...prev, ...p }));

  const activeParams = req.params.filter((p) => p.enabled && p.key.trim()).length;
  const activeHeaders = req.headers.filter((h) => h.enabled && h.key.trim()).length;

  const send = async () => {
    if (!req.url.trim()) {
      setError({ message: 'Chưa nhập URL' });
      setResponse(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await sendRequest(req);
      setResponse(res);
      add(req, res.status);
    } catch (err) {
      setError(err as RequestError);
      add(req);
    } finally {
      setLoading(false);
    }
  };

  const pickHistory = (entry: HistoryEntry) => {
    setReq(entry.request);
    setResponse(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>curly</h1>
      </header>

      <div className="layout">
        <HistoryPanel history={history} onPick={pickHistory} onClear={clear} />

        <main className="main">
          <div className="url-bar">
            <select
              className={`method-select m-${req.method}`}
              value={req.method}
              onChange={(e) => patch({ method: e.target.value as HttpMethod })}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              className="url-input"
              value={req.url}
              placeholder="https://api.example.com/endpoint"
              onChange={(e) => patch({ url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
            />
            <button className="send-btn" onClick={send} disabled={loading}>
              {loading ? '…' : 'Send'}
            </button>
          </div>

          <div className="req-tabs">
            <button className={tab === 'params' ? 'active' : ''} onClick={() => setTab('params')}>
              Params{activeParams ? ` (${activeParams})` : ''}
            </button>
            <button className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
              Headers{activeHeaders ? ` (${activeHeaders})` : ''}
            </button>
            <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
              Body{req.bodyType !== 'none' ? ' •' : ''}
            </button>
          </div>

          <div className="req-panel">
            {tab === 'params' && (
              <KeyValueEditor
                items={req.params}
                onChange={(params) => patch({ params })}
                keyPlaceholder="Param"
              />
            )}
            {tab === 'headers' && (
              <KeyValueEditor
                items={req.headers}
                onChange={(headers) => patch({ headers })}
                keyPlaceholder="Header"
              />
            )}
            {tab === 'body' && (
              <div className="body-panel">
                <div className="body-types">
                  {(['none', 'json', 'raw'] as BodyType[]).map((bt) => (
                    <label key={bt}>
                      <input
                        type="radio"
                        name="bodyType"
                        checked={req.bodyType === bt}
                        onChange={() => patch({ bodyType: bt })}
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
                    onChange={(e) => patch({ body: e.target.value })}
                    spellCheck={false}
                  />
                )}
              </div>
            )}
          </div>

          <ResponseView loading={loading} response={response} error={error} />
        </main>
      </div>
    </div>
  );
}
