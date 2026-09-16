import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { resolveVars } from '../config/apiClient';
import type { Protocol } from '../types/request';

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface LogEntry {
  id: string;
  dir: 'in' | 'out' | 'sys';
  text: string;
  event?: string;
  at: number;
}

interface Props {
  protocol: Protocol;
  url: string;
  vars: Record<string, string>;
}

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Chưa kết nối',
  connecting: 'Đang kết nối…',
  open: 'Đã kết nối',
  closed: 'Đã đóng',
  error: 'Lỗi',
};

function fmtTime(at: number): string {
  return new Date(at).toLocaleTimeString('vi-VN', { hour12: false });
}

export default function RealtimePanel({ protocol, url, vars }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const resolved = url ? resolveVars(url, vars).trim() : '';
  const connected = status === 'open' || status === 'connecting';

  const push = (dir: LogEntry['dir'], text: string, event?: string) =>
    setLog((prev) =>
      [...prev, { id: crypto.randomUUID(), dir, text, event, at: Date.now() }].slice(-500),
    );

  const cleanup = () => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const connect = () => {
    if (!resolved) {
      push('sys', 'Chưa nhập URL');
      return;
    }
    cleanup();
    setStatus('connecting');
    push('sys', `Đang kết nối tới ${resolved}`);

    if (protocol === 'ws') {
      try {
        const ws = new WebSocket(resolved);
        wsRef.current = ws;
        ws.onopen = () => {
          setStatus('open');
          push('sys', 'WebSocket đã mở');
        };
        ws.onmessage = (e) => push('in', typeof e.data === 'string' ? e.data : '[binary]');
        ws.onerror = () => {
          setStatus('error');
          push('sys', 'Lỗi WebSocket');
        };
        ws.onclose = (e) => {
          setStatus('closed');
          push('sys', `Đã đóng (code ${e.code}${e.reason ? ' · ' + e.reason : ''})`);
        };
      } catch {
        setStatus('error');
        push('sys', 'URL WebSocket không hợp lệ');
      }
    } else {
      try {
        const es = new EventSource(resolved);
        esRef.current = es;
        es.onopen = () => {
          setStatus('open');
          push('sys', 'SSE đã mở');
        };
        es.onmessage = (e) => push('in', e.data, e.type);
        es.onerror = () => {
          if (es.readyState === EventSource.CLOSED) {
            setStatus('closed');
            push('sys', 'SSE đã đóng');
          } else {
            setStatus('error');
            push('sys', 'Lỗi hoặc đang thử kết nối lại…');
          }
        };
      } catch {
        setStatus('error');
        push('sys', 'URL SSE không hợp lệ');
      }
    }
  };

  const disconnect = () => {
    cleanup();
    setStatus('closed');
    push('sys', 'Đã ngắt kết nối');
  };

  const sendMessage = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!input) return;
    ws.send(input);
    push('out', input);
    setInput('');
  };

  return (
    <div className="rt-panel">
      <div className="rt-bar">
        <span className={`rt-status s-${status}`}>
          <span className="rt-dot" />
          {STATUS_LABEL[status]}
        </span>
        <span className="rt-proto">{protocol === 'ws' ? 'WebSocket' : 'SSE'}</span>
        {resolved && <span className="rt-url">{resolved}</span>}
        <div className="rt-actions">
          {connected ? (
            <Button variant="primary" onClick={disconnect}>
              Ngắt kết nối
            </Button>
          ) : (
            <Button variant="primary" className="rt-connect" onClick={connect}>
              Kết nối
            </Button>
          )}
          <button className="copy-btn" onClick={() => setLog([])} title="Xóa log">
            Xóa log
          </button>
        </div>
      </div>

      {protocol === 'ws' && (
        <div className="rt-send-row">
          <textarea
            className="rt-input"
            value={input}
            placeholder="Nội dung tin nhắn gửi đi…"
            disabled={status !== 'open'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendMessage();
              }
            }}
            spellCheck={false}
          />
          <Button variant="primary" onClick={sendMessage} disabled={status !== 'open' || !input}>
            Gửi
          </Button>
        </div>
      )}

      <div className="rt-log" ref={logRef}>
        {log.length === 0 ? (
          <div className="rt-empty">
            {protocol === 'ws'
              ? 'Bấm Kết nối để mở WebSocket, sau đó gửi/nhận tin nhắn realtime.'
              : 'Bấm Kết nối để nghe luồng sự kiện SSE (EventSource).'}
          </div>
        ) : (
          <ul>
            {log.map((e) => (
              <li key={e.id} className={`rt-msg dir-${e.dir}`}>
                <span className="rt-arrow">
                  {e.dir === 'in' ? '↓' : e.dir === 'out' ? '↑' : '•'}
                </span>
                <span className="rt-time">{fmtTime(e.at)}</span>
                {e.event && e.dir === 'in' && <span className="rt-event">{e.event}</span>}
                <span className="rt-text">{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
