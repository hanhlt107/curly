export interface DotenvPair {
  key: string;
  value: string;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(["\\nrt])/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return c;
  });
}

export function parseDotenv(text: string): DotenvPair[] {
  const out: DotenvPair[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || !/^[\w.-]+$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.length >= 2) {
      const end = value.indexOf('"', 1);
      value = end > 0 ? unescapeDouble(value.slice(1, end)) : unescapeDouble(value.slice(1));
    } else if (value.startsWith("'") && value.length >= 2) {
      const end = value.indexOf("'", 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out.push({ key, value });
  }
  return out;
}
