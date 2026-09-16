import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { countRequests } from '../config/collections';
import { makeQrMatrix } from '../config/qr';
import {
  RTC_CONFIG,
  createChannelReceiver,
  decodeSignal,
  encodeSignal,
  sendWorkspaceOverChannel,
  waitForIceComplete,
  type SharedWorkspace,
} from '../config/p2p';

export interface ReceiveSummary {
  collections: number;
  requests: number;
  environments: number;
}

interface Props {
  getWorkspace: () => SharedWorkspace;
  onReceive: (shared: SharedWorkspace) => Promise<ReceiveSummary | null>;
  onClose: () => void;
}

type Mode = 'choose' | 'host' | 'join';
type Status = 'idle' | 'preparing' | 'waiting' | 'connecting' | 'connected' | 'done' | 'error';

function QrView({ text }: { text: string }) {
  const matrix = useMemo(() => makeQrMatrix(text), [text]);
  if (!matrix) {
    return (
      <div className="p2p-qr-fail">
        Mã QR quá lớn để hiển thị — hãy dùng nút Copy và dán mã ở thiết bị kia.
      </div>
    );
  }
  const n = matrix.length;
  const quiet = 2;
  const size = n + quiet * 2;
  const path: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) path.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg
      className="p2p-qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Mã QR kết nối"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path.join('')} fill="#000000" />
    </svg>
  );
}

export default function P2PShareModal({ getWorkspace, onReceive, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [outBlob, setOutBlob] = useState('');
  const [inBlob, setInBlob] = useState('');
  const [copied, setCopied] = useState(false);
  const [sentSummary, setSentSummary] = useState<ReceiveSummary | null>(null);
  const [recvSummary, setRecvSummary] = useState<ReceiveSummary | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearWatchdog();
    if (channelRef.current) {
      channelRef.current.onopen = null;
      channelRef.current.onmessage = null;
      channelRef.current.onclose = null;
      try {
        channelRef.current.close();
      } catch {
        setErrorMsg('');
      }
      channelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      try {
        pcRef.current.close();
      } catch {
        setErrorMsg('');
      }
      pcRef.current = null;
    }
  }, [clearWatchdog]);

  useEffect(() => teardown, [teardown]);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      if (channelRef.current?.readyState !== 'open') {
        setStatus('error');
        setErrorMsg('Hết thời gian chờ kết nối. Hãy thử lại — có thể hai thiết bị khác mạng.');
        teardown();
      }
    }, 45000);
  }, [clearWatchdog, teardown]);

  const watchConnection = useCallback((pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (channelRef.current?.readyState !== 'open') {
          setStatus('error');
          setErrorMsg('Kết nối thất bại. Hãy đặt lại và thử lại.');
        }
      }
    };
  }, []);

  const reset = useCallback(() => {
    teardown();
    setMode('choose');
    setStatus('idle');
    setErrorMsg('');
    setOutBlob('');
    setInBlob('');
    setCopied(false);
    setSentSummary(null);
    setRecvSummary(null);
  }, [teardown]);

  const startHost = useCallback(async () => {
    teardown();
    setMode('host');
    setStatus('preparing');
    setErrorMsg('');
    setOutBlob('');
    setInBlob('');
    setSentSummary(null);
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      watchConnection(pc);
      const channel = pc.createDataChannel('curly');
      channelRef.current = channel;
      channel.onopen = () => {
        clearWatchdog();
        const workspace = getWorkspace();
        sendWorkspaceOverChannel(channel, JSON.stringify(workspace));
        setSentSummary({
          collections: workspace.collections.length,
          requests: workspace.collections.reduce((n, c) => n + countRequests(c), 0),
          environments: workspace.environments.length,
        });
        setStatus('done');
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceComplete(pc);
      const blob = await encodeSignal({ t: 'offer', sdp: pc.localDescription?.sdp ?? '' });
      setOutBlob(blob);
      setStatus('waiting');
    } catch {
      setStatus('error');
      setErrorMsg('Không tạo được mã kết nối trên trình duyệt này.');
    }
  }, [teardown, watchConnection, clearWatchdog, getWorkspace]);

  const finishHost = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const signal = await decodeSignal(inBlob);
      if (signal.t !== 'answer') throw new Error('Cần dán mã trả lời (answer) của thiết bị nhận.');
      setStatus('connecting');
      armWatchdog();
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message || 'Mã trả lời không hợp lệ.');
    }
  }, [inBlob, armWatchdog]);

  const handleReceived = useCallback(
    async (payload: string) => {
      clearWatchdog();
      try {
        const shared = JSON.parse(payload) as SharedWorkspace;
        const summary = await onReceive(shared);
        if (summary) {
          setRecvSummary(summary);
          setStatus('done');
        } else {
          setStatus('connected');
        }
      } catch {
        setStatus('error');
        setErrorMsg('Dữ liệu nhận được bị lỗi, không đọc được workspace.');
      }
    },
    [clearWatchdog, onReceive],
  );

  const finishJoin = useCallback(async () => {
    teardown();
    setStatus('preparing');
    setErrorMsg('');
    setOutBlob('');
    setRecvSummary(null);
    try {
      const signal = await decodeSignal(inBlob);
      if (signal.t !== 'offer') throw new Error('Cần dán mã mời (offer) của thiết bị gửi.');
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      watchConnection(pc);
      const receiver = createChannelReceiver(handleReceived);
      pc.ondatachannel = (e) => {
        const channel = e.channel;
        channelRef.current = channel;
        channel.onopen = () => setStatus('connected');
        channel.onmessage = (ev) => receiver(String(ev.data));
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceComplete(pc);
      const blob = await encodeSignal({ t: 'answer', sdp: pc.localDescription?.sdp ?? '' });
      setOutBlob(blob);
      setStatus('waiting');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message || 'Mã mời không hợp lệ.');
    }
  }, [teardown, inBlob, watchConnection, handleReceived]);

  const copyOut = useCallback(() => {
    navigator.clipboard?.writeText(outBlob);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [outBlob]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'preparing':
        return 'Đang chuẩn bị…';
      case 'waiting':
        return 'Chờ trao đổi mã kết nối…';
      case 'connecting':
        return 'Đang kết nối…';
      case 'connected':
        return 'Đã kết nối — đang truyền dữ liệu…';
      case 'done':
        return mode === 'host' ? 'Đã gửi xong!' : 'Đã nhận xong!';
      case 'error':
        return 'Lỗi';
      default:
        return '';
    }
  }, [status, mode]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal p2p-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Chia sẻ P2P</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="cookie-hint">
            Chuyển toàn bộ workspace (collections, môi trường, biến global) trực tiếp giữa hai thiết
            bị qua WebRTC — không qua máy chủ nào. Secret sẽ được loại bỏ trước khi gửi. Trao đổi mã
            kết nối bằng cách Copy/dán hoặc quét QR.
          </div>

          {status !== 'idle' && (
            <div className={`p2p-status p2p-status-${status}`}>
              <span className="p2p-status-dot" />
              {statusLabel}
              {status === 'error' && errorMsg && <div className="p2p-error">{errorMsg}</div>}
            </div>
          )}

          {mode === 'choose' && (
            <div className="p2p-choose">
              <button className="p2p-pick" onClick={startHost}>
                <span className="p2p-pick-ico">📤</span>
                <small>Chia sẻ workspace của thiết bị này cho thiết bị khác</small>
              </button>
              <button
                className="p2p-pick"
                onClick={() => {
                  setMode('join');
                  setStatus('idle');
                  setErrorMsg('');
                  setInBlob('');
                  setOutBlob('');
                }}
              >
                <span className="p2p-pick-ico">📥</span>
                <small>Nhận workspace từ thiết bị khác và gộp vào đây</small>
              </button>
            </div>
          )}

          {mode === 'host' && (
            <div className="p2p-flow">
              <div className="p2p-step">
                <label className="field-label">1 · Mã mời — đưa cho thiết bị nhận</label>
                {outBlob ? (
                  <>
                    <div className="p2p-qr-wrap">
                      <QrView text={outBlob} />
                    </div>
                    <textarea className="body-input p2p-blob" readOnly value={outBlob} />
                    <Button size="sm" onClick={copyOut}>
                      {copied ? '✓ Đã copy' : 'Copy mã mời'}
                    </Button>
                  </>
                ) : (
                  <div className="p2p-wait-note">Đang tạo mã mời…</div>
                )}
              </div>

              {outBlob && status !== 'done' && (
                <div className="p2p-step">
                  <label className="field-label">2 · Dán mã trả lời từ thiết bị nhận</label>
                  <textarea
                    className="body-input p2p-blob"
                    placeholder="Dán mã trả lời (answer) vào đây…"
                    value={inBlob}
                    onChange={(e) => setInBlob(e.target.value)}
                  />
                  <Button variant="primary" onClick={finishHost} disabled={!inBlob.trim()}>
                    Kết nối & gửi
                  </Button>
                </div>
              )}

              {status === 'done' && sentSummary && (
                <div className="p2p-done">
                  Đã gửi {sentSummary.collections} collection · {sentSummary.requests} request ·{' '}
                  {sentSummary.environments} môi trường.
                </div>
              )}
            </div>
          )}

          {mode === 'join' && (
            <div className="p2p-flow">
              <div className="p2p-step">
                <label className="field-label">1 · Dán mã mời từ thiết bị gửi</label>
                <textarea
                  className="body-input p2p-blob"
                  placeholder="Dán mã mời (offer) vào đây…"
                  value={inBlob}
                  onChange={(e) => setInBlob(e.target.value)}
                  disabled={!!outBlob}
                />
                {!outBlob && (
                  <Button variant="primary" onClick={finishJoin} disabled={!inBlob.trim()}>
                    Tạo mã trả lời
                  </Button>
                )}
              </div>

              {outBlob && status !== 'done' && (
                <div className="p2p-step">
                  <label className="field-label">2 · Mã trả lời — đưa lại cho thiết bị gửi</label>
                  <div className="p2p-qr-wrap">
                    <QrView text={outBlob} />
                  </div>
                  <textarea className="body-input p2p-blob" readOnly value={outBlob} />
                  <Button size="sm" onClick={copyOut}>
                    {copied ? '✓ Đã copy' : 'Copy mã trả lời'}
                  </Button>
                </div>
              )}

              {status === 'done' && recvSummary && (
                <div className="p2p-done">
                  Đã nhận {recvSummary.collections} collection · {recvSummary.requests} request ·{' '}
                  {recvSummary.environments} môi trường.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot cookie-foot">
          {mode !== 'choose' && <Button onClick={reset}>Đặt lại</Button>}
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
