export type VizKind = 'json' | 'image' | 'html' | 'unknown';

export function parseJson(data: unknown, raw: string): { value: unknown; ok: boolean } {
  if (data !== undefined && data !== null && typeof data !== 'string') {
    return { value: data, ok: true };
  }
  const text = typeof data === 'string' ? data : raw;
  try {
    return { value: JSON.parse(text), ok: true };
  } catch {
    return { value: undefined, ok: false };
  }
}

export function detectViz(contentType: string, data: unknown, raw: string): VizKind {
  const ct = contentType.toLowerCase();
  if (/image\//.test(ct)) return 'image';
  if (/text\/html|application\/xhtml/.test(ct)) return 'html';
  if (parseJson(data, raw).ok) return 'json';
  return 'unknown';
}

export function isObjectRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFlat(v: unknown): boolean {
  return v === null || typeof v !== 'object';
}

export function isFlatObjectArray(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.length) return false;
  return value.every((row) => isObjectRecord(row) && Object.values(row).every(isFlat));
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number');
}

export function tableColumns(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

export function numericColumns(rows: Record<string, unknown>[]): string[] {
  return tableColumns(rows).filter(
    (col) =>
      rows.some((r) => typeof r[col] === 'number') &&
      rows.every((r) => r[col] === undefined || r[col] === null || typeof r[col] === 'number'),
  );
}

export function cellText(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function imageDataUrl(contentType: string, raw: string): string | null {
  const ct = contentType.split(';')[0].trim() || 'image/png';
  if (/svg/.test(ct)) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`;
  }
  if (/^data:/.test(raw.trim())) return raw.trim();
  try {
    return `data:${ct};base64,${btoa(raw)}`;
  } catch {
    return null;
  }
}
