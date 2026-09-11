import type { HistoryEntry } from '../types/request';

interface Props {
  history: HistoryEntry[];
  onPick: (entry: HistoryEntry) => void;
  onClear: () => void;
}

function statusClass(status?: number): string {
  if (status == null) return '';
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400) return 'error';
  return 'redirect';
}

export default function HistoryPanel({ history, onPick, onClear }: Props) {
  return (
    <aside className="history">
      <div className="history-head">
        <span>Lịch sử</span>
        {history.length > 0 && (
          <button onClick={onClear} title="Xóa lịch sử">
            Xóa
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="history-empty">Chưa có request nào.</p>
      ) : (
        <ul>
          {history.map((h) => (
            <li key={h.id} onClick={() => onPick(h)}>
              <span className={`method m-${h.method}`}>{h.method}</span>
              <span className="h-url" title={h.url}>
                {h.url || '(trống)'}
              </span>
              {h.status != null && (
                <span className={`h-status ${statusClass(h.status)}`}>{h.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
