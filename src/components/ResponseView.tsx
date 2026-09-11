import { useState } from 'react';
import type { ApiResponse, RequestError } from '../types/request';

interface Props {
  loading: boolean;
  response: ApiResponse | null;
  error: RequestError | null;
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400) return 'error';
  return '';
}

function formatBody(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function ResponseView({ loading, response, error }: Props) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');

  if (loading) {
    return <div className="resp-empty">Đang gọi…</div>;
  }

  if (error) {
    return (
      <div className="resp-error">
        <strong>{error.message}</strong>
        {error.detail && <p>{error.detail}</p>}
      </div>
    );
  }

  if (!response) {
    return <div className="resp-empty">Nhập URL rồi bấm Send để xem kết quả.</div>;
  }

  const headerEntries = Object.entries(response.headers);

  return (
    <div className="resp">
      <div className="resp-meta">
        <span className={`badge ${statusClass(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        <span className="meta-item">{response.durationMs} ms</span>
        <span className="meta-item">{formatSize(response.sizeBytes)}</span>
      </div>

      <div className="resp-tabs">
        <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
          Body
        </button>
        <button className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
          Headers ({headerEntries.length})
        </button>
      </div>

      {tab === 'body' ? (
        <pre className="resp-body">{formatBody(response.data)}</pre>
      ) : (
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
    </div>
  );
}
