import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import QrView from './QrView';
import {
  RTC_CONFIG,
  createLiveReceiver,
  decodeSignal,
  diffRequest,
  encodeSignal,
  sendLiveMessage,
  waitForIceComplete,
  type LiveMessage,
} from '../config/p2p';
import type { ApiRequest } from '../types/request';

interface Props {
  request: ApiRequest;
  onPatch: (patch: Partial<ApiRequest>) => void;
  onClose: () => void;
}

type Mode = 'choose' | 'host' | 'join';
type Status = 'idle' | 'preparing' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'error';

const SEND_DELAY = 150;
const PRESENCE_IDLE = 1200;

export default function LiveShareModal({ request, onPatch, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [outBlob, setOutBlob] = useState('');
  const [inBlob, setInBlob] = useState('');
  const [copied, setCopied] = useState(false);
  const [peerEditing, setPeerEditing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(request);
  const syncedRef = useRef<ApiRequest | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingSentRef = useRef(false);
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    if (presenceTimerRef.current) {
      clearTimeout(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearWatchdog();
    clearTimers();
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
    syncedRef.current = null;
    editingSentRef.current = false;
  }, [clearWatchdog, clearTimers]);

  useEffect(() => teardown, [teardown]);

  const applyRemote = useCallback(
    (msg: LiveMessage) => {
      if (msg.t === 'presence') {
        setPeerEditing(msg.editing);
        return;
      }
      if (syncedRef.current) {
        syncedRef.current = { ...syncedRef.current, ...msg.patch };
      }
      onPatch(msg.patch);
      setPeerEditing(true);
    },
    [onPatch],
  );

  const startLive = useCallback(
    (channel: RTCDataChannel) => {
      wasConnectedRef.current = true;
      syncedRef.current = requestRef.current;
      const receiver = createLiveReceiver(applyRemote);
      channel.onmessage = (ev) => receiver(String(ev.data));
      channel.onclose = () => {
        clearTimers();
        setPeerEditing(false);
        setStatus('ended');
      };
      setStatus('connected');
    },
    [applyRemote, clearTimers],
  );

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
          if (wasConnectedRef.current) {
            setStatus('ended');
          } else {
            setStatus('error');
            setErrorMsg('Kết nối thất bại. Hãy đặt lại và thử lại.');
          }
        }
      }
    };
  }, []);

  const reset = useCallback(() => {
    teardown();
    wasConnectedRef.current = false;
    setMode('choose');
    setStatus('idle');
    setErrorMsg('');
    setOutBlob('');
    setInBlob('');
    setCopied(false);
    setPeerEditing(false);
  }, [teardown]);

  const startHost = useCallback(async () => {
    teardown();
    wasConnectedRef.current = false;
    setMode('host');
    setStatus('preparing');
    setErrorMsg('');
    setOutBlob('');
    setInBlob('');
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      watchConnection(pc);
      const channel = pc.createDataChannel('curly-live');
      channelRef.current = channel;
      channel.onopen = () => {
        clearWatchdog();
        startLive(channel);
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
  }, [teardown, watchConnection, clearWatchdog, startLive]);

  const finishHost = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const signal = await decodeSignal(inBlob);
      if (signal.t !== 'answer') throw new Error('Cần dán mã trả lời (answer) của thiết bị kia.');
      setStatus('connecting');
      armWatchdog();
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message || 'Mã trả lời không hợp lệ.');
    }
  }, [inBlob, armWatchdog]);

  const finishJoin = useCallback(async () => {
    teardown();
    wasConnectedRef.current = false;
    setStatus('preparing');
    setErrorMsg('');
    setOutBlob('');
    try {
      const signal = await decodeSignal(inBlob);
      if (signal.t !== 'offer') throw new Error('Cần dán mã mời (offer) của thiết bị kia.');
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      watchConnection(pc);
      pc.ondatachannel = (e) => {
        const channel = e.channel;
        channelRef.current = channel;
        channel.onopen = () => startLive(channel);
        if (channel.readyState === 'open') startLive(channel);
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
  }, [teardown, inBlob, watchConnection, startLive]);

  useEffect(() => {
    if (status !== 'connected') return;
    const channel = channelRef.current;
    const base = syncedRef.current;
    if (!channel || channel.readyState !== 'open' || !base) return;
    const patch = diffRequest(base, request);
    if (Object.keys(patch).length === 0) return;
    syncedRef.current = request;

    if (!editingSentRef.current) {
      editingSentRef.current = true;
      sendLiveMessage(channel, { t: 'presence', editing: true });
    }

    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => {
      const merged = diffRequest(base, requestRef.current);
      sendLiveMessage(channel, { t: 'req-patch', patch: merged });
    }, SEND_DELAY);

    if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
    presenceTimerRef.current = setTimeout(() => {
      editingSentRef.current = false;
      sendLiveMessage(channel, { t: 'presence', editing: false });
    }, PRESENCE_IDLE);
  }, [request, status]);

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
        return peerEditing ? 'Đã kết nối · đối phương đang sửa…' : 'Đã kết nối — đồng bộ realtime';
      case 'ended':
        return 'Đối phương đã ngắt kết nối.';
      case 'error':
        return 'Lỗi';
      default:
        return '';
    }
  }, [status, peerEditing]);

  if (status === 'connected' || status === 'ended') {
    const active = status === 'connected';
    const badgeClass = `live-badge${!active ? ' ended' : peerEditing ? ' editing' : ''}`;
    return createPortal(
      <div className={badgeClass}>
        <div className="live-badge-head">
          <span className="live-badge-dot" />
          <span>Live share</span>
        </div>
        <div className="live-badge-status">{statusLabel}</div>
        <div className="live-badge-actions">
          {status === 'ended' && (
            <Button size="sm" onClick={reset}>
              Kết nối lại
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={onClose}>
            {active ? 'Dừng' : 'Đóng'}
          </Button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal p2p-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Live share request</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="cookie-hint">
            Cùng sửa request đang mở với một người khác theo thời gian thực qua WebRTC — không qua
            máy chủ nào. Trao đổi mã kết nối bằng Copy/dán hoặc quét QR, sau đó cả hai bên chỉnh sửa
            và đồng bộ hai chiều.
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
                <span className="p2p-pick-ico">🎙️</span>
                <small>Mở phiên live và mời người khác cùng sửa request này</small>
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
                <span className="p2p-pick-ico">🤝</span>
                <small>Tham gia phiên live từ mã mời của người khác</small>
              </button>
            </div>
          )}

          {mode === 'host' && (
            <div className="p2p-flow">
              <div className="p2p-step">
                <label className="field-label">1 · Mã mời — đưa cho người cùng sửa</label>
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

              {outBlob && (
                <div className="p2p-step">
                  <label className="field-label">2 · Dán mã trả lời từ người kia</label>
                  <textarea
                    className="body-input p2p-blob"
                    placeholder="Dán mã trả lời (answer) vào đây…"
                    value={inBlob}
                    onChange={(e) => setInBlob(e.target.value)}
                  />
                  <Button variant="primary" onClick={finishHost} disabled={!inBlob.trim()}>
                    Kết nối
                  </Button>
                </div>
              )}
            </div>
          )}

          {mode === 'join' && (
            <div className="p2p-flow">
              <div className="p2p-step">
                <label className="field-label">1 · Dán mã mời từ người mở phiên</label>
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

              {outBlob && (
                <div className="p2p-step">
                  <label className="field-label">2 · Mã trả lời — đưa lại cho người mở phiên</label>
                  <div className="p2p-qr-wrap">
                    <QrView text={outBlob} />
                  </div>
                  <textarea className="body-input p2p-blob" readOnly value={outBlob} />
                  <Button size="sm" onClick={copyOut}>
                    {copied ? '✓ Đã copy' : 'Copy mã trả lời'}
                  </Button>
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
