import type { Collection, Environment, KeyValue } from '../types/request';
import { buildExport, type WorkspaceExport } from './workspace';

export interface SharedWorkspace extends WorkspaceExport {
  globals?: KeyValue[];
}

export interface Signal {
  t: 'offer' | 'answer';
  sdp: string;
}

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function sanitizeGlobals(globals: KeyValue[]): KeyValue[] {
  return globals.map((v) => (v.secret ? { ...v, value: '' } : v));
}

export function buildSharedWorkspace(
  collections: Collection[],
  environments: Environment[],
  globals: KeyValue[],
): SharedWorkspace {
  return { ...buildExport(collections, environments), globals: sanitizeGlobals(globals) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes as BufferSource);
  writer.close();
  const buffer = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes as BufferSource);
  writer.close();
  const buffer = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

const hasCompression = typeof CompressionStream !== 'undefined';

export async function encodeBlob(text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  if (hasCompression) {
    const packed = await gzip(raw);
    return 'G' + bytesToBase64(packed);
  }
  return 'U' + bytesToBase64(raw);
}

export async function decodeBlob(blob: string): Promise<string> {
  const trimmed = blob.trim();
  const tag = trimmed[0];
  const bytes = base64ToBytes(trimmed.slice(1));
  if (tag === 'G') {
    return new TextDecoder().decode(await gunzip(bytes));
  }
  if (tag === 'U') {
    return new TextDecoder().decode(bytes);
  }
  throw new Error('Mã kết nối không hợp lệ.');
}

export async function encodeSignal(signal: Signal): Promise<string> {
  return encodeBlob(JSON.stringify(signal));
}

export async function decodeSignal(blob: string): Promise<Signal> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await decodeBlob(blob));
  } catch {
    throw new Error('Mã kết nối không hợp lệ hoặc bị hỏng.');
  }
  const sig = parsed as Partial<Signal>;
  if (!sig || (sig.t !== 'offer' && sig.t !== 'answer') || typeof sig.sdp !== 'string') {
    throw new Error('Mã kết nối không hợp lệ.');
  }
  return { t: sig.t, sdp: sig.sdp };
}

export function waitForIceComplete(pc: RTCPeerConnection, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function sendWorkspaceOverChannel(channel: RTCDataChannel, payload: string): void {
  const chunkSize = 16 * 1024;
  channel.send('B' + String(payload.length));
  for (let i = 0; i < payload.length; i += chunkSize) {
    channel.send('D' + payload.slice(i, i + chunkSize));
  }
  channel.send('E');
}

export function createChannelReceiver(onComplete: (payload: string) => void) {
  let buffer = '';
  return (data: string) => {
    const tag = data[0];
    const body = data.slice(1);
    if (tag === 'B') {
      buffer = '';
    } else if (tag === 'D') {
      buffer += body;
    } else if (tag === 'E') {
      onComplete(buffer);
    }
  };
}
