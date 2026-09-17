export function parseCookies(
  headers: Record<string, string>,
): { name: string; value: string; attrs: string }[] {
  const raw = headers['set-cookie'];
  if (!raw) return [];
  return raw
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [pair, ...rest] = c.split(';');
      const eq = pair.indexOf('=');
      return {
        name: eq > -1 ? pair.slice(0, eq).trim() : pair.trim(),
        value: eq > -1 ? pair.slice(eq + 1).trim() : '',
        attrs: rest.map((r) => r.trim()).join('; '),
      };
    });
}

export function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400) return 'error';
  return '';
}

export function prettify(data: unknown, raw: string): string {
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return raw;
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Tô màu JSON đơn giản bằng regex → HTML. */
export function highlightJson(text: string): string {
  const safe = esc(text);
  return safe.replace(
    /("(\\.|[^"\\])*"(\s*:)?)|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
    (m) => {
      let cls = 'j-num';
      if (/^"/.test(m)) cls = /:$/.test(m.trim()) ? 'j-key' : 'j-str';
      else if (/true|false/.test(m)) cls = 'j-bool';
      else if (/null/.test(m)) cls = 'j-null';
      return `<span class="${cls}">${m}</span>`;
    },
  );
}

export function highlightSearch(html: string, term: string): string {
  if (!term) return html;
  const safe = esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
}

export function valueType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
