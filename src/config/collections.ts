import type { Collection, Folder, SavedRequest } from '../types/request';

export interface Container {
  requests: SavedRequest[];
  folders: Folder[];
}

export function collectRequests(c: Container): SavedRequest[] {
  const out = [...c.requests];
  for (const f of c.folders) out.push(...collectRequests(f));
  return out;
}

export function countRequests(c: Container): number {
  let n = c.requests.length;
  for (const f of c.folders) n += countRequests(f);
  return n;
}

export function findRequest(c: Container, id: string): SavedRequest | undefined {
  const hit = c.requests.find((r) => r.id === id);
  if (hit) return hit;
  for (const f of c.folders) {
    const r = findRequest(f, id);
    if (r) return r;
  }
  return undefined;
}

export function removeRequest<T extends Container>(c: T, id: string): T {
  return {
    ...c,
    requests: c.requests.filter((r) => r.id !== id),
    folders: c.folders.map((f) => removeRequest(f, id)),
  };
}

export function insertRequest<T extends Container>(
  c: T,
  folderId: string | null,
  req: SavedRequest,
): T {
  if (folderId === null) {
    return { ...c, requests: [...c.requests, req] };
  }
  return {
    ...c,
    folders: c.folders.map((f) =>
      f.id === folderId
        ? { ...f, requests: [...f.requests, req] }
        : insertRequest(f, folderId, req),
    ),
  };
}

export function duplicateRequest<T extends Container>(
  c: T,
  id: string,
  makeCopy: (src: SavedRequest) => SavedRequest,
): T {
  const idx = c.requests.findIndex((r) => r.id === id);
  if (idx >= 0) {
    const requests = [...c.requests];
    requests.splice(idx + 1, 0, makeCopy(requests[idx]));
    return { ...c, requests };
  }
  return { ...c, folders: c.folders.map((f) => duplicateRequest(f, id, makeCopy)) };
}

export function addFolder<T extends Container>(c: T, parentId: string | null, folder: Folder): T {
  if (parentId === null) {
    return { ...c, folders: [...c.folders, folder] };
  }
  return {
    ...c,
    folders: c.folders.map((f) =>
      f.id === parentId
        ? { ...f, folders: [...f.folders, folder] }
        : addFolder(f, parentId, folder),
    ),
  };
}

export function renameFolder<T extends Container>(c: T, folderId: string, name: string): T {
  return {
    ...c,
    folders: c.folders.map((f) =>
      f.id === folderId ? { ...f, name } : renameFolder(f, folderId, name),
    ),
  };
}

export function deleteFolder<T extends Container>(c: T, folderId: string): T {
  return {
    ...c,
    folders: c.folders.filter((f) => f.id !== folderId).map((f) => deleteFolder(f, folderId)),
  };
}

export function extractFolder<T extends Container>(
  c: T,
  folderId: string,
): { container: T; folder: Folder | null } {
  let found: Folder | null = null;
  const folders: Folder[] = [];
  for (const f of c.folders) {
    if (f.id === folderId) {
      found = f;
      continue;
    }
    const inner = extractFolder(f, folderId);
    if (inner.folder) found = inner.folder;
    folders.push(inner.container);
  }
  return { container: { ...c, folders }, folder: found };
}

export function folderContains(folder: Folder, id: string): boolean {
  if (folder.id === id) return true;
  return folder.folders.some((f) => folderContains(f, id));
}

export function findRequestFolderId(c: Container, requestId: string): string | null | undefined {
  if (c.requests.some((r) => r.id === requestId)) return null;
  for (const f of c.folders) {
    if (f.requests.some((r) => r.id === requestId)) return f.id;
    const inner = findRequestFolderId(f, requestId);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

export interface LocatedRequest {
  saved: SavedRequest;
  collectionId: string;
  collectionName: string;
  path: string;
}

export function locateRequests(collections: Collection[]): LocatedRequest[] {
  const out: LocatedRequest[] = [];
  for (const c of collections) {
    for (const r of c.requests) {
      out.push({ saved: r, collectionId: c.id, collectionName: c.name, path: c.name });
    }
    const walk = (folders: Folder[], prefix: string) => {
      for (const f of folders) {
        const path = `${prefix} / ${f.name}`;
        for (const r of f.requests) {
          out.push({ saved: r, collectionId: c.id, collectionName: c.name, path });
        }
        walk(f.folders, path);
      }
    };
    walk(c.folders, c.name);
  }
  return out;
}

export interface MoveTarget {
  collectionId: string;
  folderId: string | null;
  label: string;
}

export function moveTargets(collections: Collection[]): MoveTarget[] {
  const out: MoveTarget[] = [];
  for (const c of collections) {
    out.push({ collectionId: c.id, folderId: null, label: `${c.name} /` });
    const walk = (folders: Folder[], prefix: string) => {
      for (const f of folders) {
        out.push({ collectionId: c.id, folderId: f.id, label: `${prefix}${f.name}` });
        walk(f.folders, `${prefix}${f.name} / `);
      }
    };
    walk(c.folders, `${c.name} / `);
  }
  return out;
}
