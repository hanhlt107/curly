import { useCallback, useEffect, useRef, useState } from 'react';
import type { Collection, Environment } from '../types/request';
import { fetchWorkspace, saveWorkspace, type WorkspaceData } from '../config/cloud';

export type SyncStatus = 'idle' | 'pulling' | 'saving' | 'synced' | 'error';

interface Params {
  userId: string | null;
  collections: Collection[];
  environments: Environment[];
  onPull: (cols: Collection[], envs: Environment[]) => void;
}

const SAVE_DELAY = 1500;

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) map.set(item.id, item);
  return [...map.values()];
}

export function useCloudSync({ userId, collections, environments, onPull }: Params) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const hasPulled = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef<WorkspaceData>({ collections, environments });

  latest.current = { collections, environments };

  useEffect(() => {
    if (!userId) {
      hasPulled.current = false;
      setStatus('idle');
      setLastSyncedAt(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hasPulled.current) return;
    hasPulled.current = true;
    setStatus('pulling');
    fetchWorkspace(userId)
      .then((remote) => {
        if (remote) {
          onPull(
            mergeById(latest.current.collections, remote.collections),
            mergeById(latest.current.environments, remote.environments),
          );
          setLastSyncedAt(remote.updatedAt);
        }
        setStatus('synced');
      })
      .catch(() => setStatus('error'));
  }, [userId, onPull]);

  useEffect(() => {
    if (!userId || !hasPulled.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setStatus('saving');
      saveWorkspace(userId, latest.current)
        .then((at) => {
          setLastSyncedAt(at);
          setStatus('synced');
        })
        .catch(() => setStatus('error'));
    }, SAVE_DELAY);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, collections, environments]);

  const syncNow = useCallback(() => {
    if (!userId) return;
    setStatus('saving');
    saveWorkspace(userId, latest.current)
      .then((at) => {
        setLastSyncedAt(at);
        setStatus('synced');
      })
      .catch(() => setStatus('error'));
  }, [userId]);

  return { status, lastSyncedAt, syncNow };
}
