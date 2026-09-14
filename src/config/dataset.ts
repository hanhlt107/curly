export type DataRow = Record<string, string>;

function parseCsv(text: string): DataRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }

  if (rows.length < 1) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj: DataRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

function parseJson(text: string): DataRow[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('File JSON phải là một mảng các object.');
  return data.map((item) => {
    const obj: DataRow = {};
    if (item && typeof item === 'object') {
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        obj[k] = v == null ? '' : String(v);
      }
    }
    return obj;
  });
}

/** Parse file dữ liệu CSV hoặc JSON thành mảng các bộ biến. */
export function parseDataset(text: string, fileName: string): DataRow[] {
  const trimmed = text.trim();
  const isJson = fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[');
  const rows = isJson ? parseJson(trimmed) : parseCsv(trimmed);
  if (rows.length === 0) throw new Error('File không có dòng dữ liệu nào.');
  return rows;
}
