import type { Collection, Environment } from '../types/request';
import { getSupabase } from './supabase';

export interface WorkspaceData {
  collections: Collection[];
  environments: Environment[];
}

export interface RemoteWorkspace extends WorkspaceData {
  updatedAt: string;
}

const TABLE = 'workspaces';

export async function fetchWorkspace(userId: string): Promise<RemoteWorkspace | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const payload = (data.data ?? {}) as WorkspaceData;
  return {
    collections: payload.collections ?? [],
    environments: payload.environments ?? [],
    updatedAt: data.updated_at as string,
  };
}

export async function saveWorkspace(userId: string, data: WorkspaceData): Promise<string> {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Chưa cấu hình Supabase');
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      data,
      updated_at: updatedAt,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
  return updatedAt;
}
