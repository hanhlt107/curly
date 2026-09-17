import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// --- Đọc tham số dòng lệnh ---------------------------------------------------

function parseArgs(argv) {
  const args = { path: null, env: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env' || a === '-e') args.env = argv[++i];
    else if (!args.path) args.path = a;
  }
  return args;
}

// --- Biến động {{$...}} (port từ src/config/dynamicVars.ts) -------------------

const FIRST_NAMES = ['Alex', 'Bao', 'Chi', 'Dan', 'Emma', 'Hana', 'Ian', 'Julia', 'Kevin', 'Lena'];
const LAST_NAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Smith', 'Jones', 'Brown'];
const WORDS = ['apple', 'river', 'cloud', 'forest', 'mountain', 'wind', 'sun', 'moon'];
const DOMAINS = ['example.com', 'mail.com', 'test.dev', 'demo.io', 'curly.app'];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function generate(name) {
  if (!name.startsWith('$')) return null;
  const parts = name.split(':');
  switch (parts[0]) {
    case '$uuid':
      return randomUUID();
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$randomInt':
      if (parts.length >= 3) {
        const min = Number(parts[1]);
        const max = Number(parts[2]);
        if (!Number.isNaN(min) && !Number.isNaN(max) && min <= max) return String(randInt(min, max));
      }
      return String(randInt(0, 1000));
    case '$randomEmail':
      return `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}${randInt(1, 999)}@${pick(DOMAINS)}`;
    case '$randomFirstName':
      return pick(FIRST_NAMES);
    case '$randomLastName':
      return pick(LAST_NAMES);
    case '$randomFullName':
      return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    case '$randomBoolean':
      return Math.random() < 0.5 ? 'true' : 'false';
    case '$randomWord':
      return pick(WORDS);
    case '$randomUrl':
      return `https://${pick(WORDS)}.${pick(DOMAINS)}`;
    case '$randomIp':
      return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
    default:
      return null;
  }
}

const VAR_RE = /\{\{\s*([\w.$:-]+)\s*\}\}/g;

function resolveVars(text, vars) {
  return String(text ?? '').replace(VAR_RE, (whole, name) => {
    if (name in vars) return vars[name];
    const dyn = generate(name);
    return dyn !== null ? dyn : whole;
  });
}

function toRecord(list, vars) {
  const out = {};
  for (const item of list ?? []) {
    if (!item.enabled) continue;
    const key = resolveVars(item.key, vars).trim();
    if (!key) continue;
    out[key] = resolveVars(item.value, vars);
  }
  return out;
}

// --- Gửi request (port ngữ nghĩa từ src/config/apiClient.ts, dùng fetch) -----

function applyAuth(req, headers, params, vars) {
  const auth = req.auth ?? { type: 'none' };
  const r = (s) => resolveVars(s ?? '', vars);
  switch (auth.type) {
    case 'bearer':
      if ((auth.bearerToken ?? '').trim()) headers.Authorization = `Bearer ${r(auth.bearerToken).trim()}`;
      break;
    case 'basic':
      headers.Authorization = `Basic ${Buffer.from(`${r(auth.basicUser)}:${r(auth.basicPass)}`).toString('base64')}`;
      break;
    case 'apikey': {
      const name = r(auth.apiKeyName).trim();
      if (!name) break;
      if (auth.apiKeyIn === 'query') params[name] = r(auth.apiKeyValue);
      else headers[name] = r(auth.apiKeyValue);
      break;
    }
  }
}

function buildBody(req, vars, headers) {
  const has = (name) => Object.keys(headers).some((k) => k.toLowerCase() === name);
  if (req.bodyType === 'none' || !req.bodyType) return undefined;

  if (req.bodyType === 'graphql') {
    const query = resolveVars(req.body, vars);
    if (!query.trim()) return undefined;
    let variables;
    if ((req.graphqlVars ?? '').trim()) variables = JSON.parse(resolveVars(req.graphqlVars, vars));
    if (!has('content-type')) headers['Content-Type'] = 'application/json';
    return JSON.stringify(variables !== undefined ? { query, variables } : { query });
  }

  if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
    const pairs = (req.formData ?? []).filter((p) => p.enabled && p.key.trim());
    if (req.bodyType === 'urlencoded') {
      if (!has('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return pairs
        .map(
          (p) =>
            `${encodeURIComponent(resolveVars(p.key, vars))}=${encodeURIComponent(resolveVars(p.value, vars))}`,
        )
        .join('&');
    }
    const fd = new FormData();
    for (const p of pairs) fd.append(resolveVars(p.key, vars), resolveVars(p.value, vars));
    return fd;
  }

  if (!(req.body ?? '').trim()) return undefined;
  const resolved = resolveVars(req.body, vars);
  if (req.bodyType === 'json') {
    if (!has('content-type')) headers['Content-Type'] = 'application/json';
    JSON.parse(resolved);
    return resolved;
  }
  return resolved;
}

async function sendRequest(req, vars) {
  const headers = toRecord(req.headers, vars);
  const params = toRecord(req.params, vars);
  applyAuth(req, headers, params, vars);

  let url = resolveVars(req.url, vars).trim();
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  if (qs) url += (url.includes('?') ? '&' : '?') + qs;

  const body = buildBody(req, vars, headers);
  const method = (req.method ?? 'GET').toUpperCase();

  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
  const durationMs = Math.round(performance.now() - start);
  const raw = await res.text();
  const resHeaders = {};
  res.headers.forEach((v, k) => {
    resHeaders[k.toLowerCase()] = v;
  });
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* giữ nguyên chuỗi */
  }
  return {
    status: res.status,
    statusText: res.statusText,
    durationMs,
    sizeBytes: Buffer.byteLength(raw),
    headers: resHeaders,
    data,
    raw,
  };
}

// --- Assertion (port nguyên văn từ src/config/tests.ts) ----------------------

function getPath(data, path) {
  const parts = path.split('.').filter(Boolean);
  let cur = data;
  for (const p of parts) {
    if (cur == null) return undefined;
    const arrMatch = p.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      cur = cur[arrMatch[1]];
      if (Array.isArray(cur)) cur = cur[Number(arrMatch[2])];
      continue;
    }
    if (/^\d+$/.test(p) && Array.isArray(cur)) cur = cur[Number(p)];
    else cur = cur[p];
  }
  return cur;
}

function cmp(a, op, b) {
  switch (op) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    default:
      return a === b;
  }
}

function evalLine(line, res) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const statusCmp = trimmed.match(/^status\s*(>=|<=|>|<)\s*(\d+)$/i);
  if (statusCmp) {
    const limit = Number(statusCmp[2]);
    const ok = cmp(res.status, statusCmp[1], limit);
    return { name: `status ${statusCmp[1]} ${limit}`, passed: ok, message: ok ? undefined : `nhận ${res.status}` };
  }

  const statusEq = trimmed.match(/^status\s*(===?|!=)\s*(\d+)$/i);
  if (statusEq) {
    const expected = Number(statusEq[2]);
    const neg = statusEq[1] === '!=';
    const ok = neg ? res.status !== expected : res.status === expected;
    return { name: `status ${statusEq[1]} ${expected}`, passed: ok, message: ok ? undefined : `nhận ${res.status}` };
  }

  const contains = trimmed.match(/^body\s+contains\s+(.+)$/i);
  if (contains) {
    const needle = contains[1].replace(/^["']|["']$/g, '');
    const ok = res.raw.includes(needle);
    return { name: `body chứa "${needle}"`, passed: ok, message: ok ? undefined : 'không tìm thấy' };
  }

  const bodyMatch = trimmed.match(/^body\s+matches\s+\/(.+)\/([a-z]*)$/i);
  if (bodyMatch) {
    let ok = false;
    let msg = 'không khớp';
    try {
      ok = new RegExp(bodyMatch[1], bodyMatch[2]).test(res.raw);
    } catch {
      msg = 'regex không hợp lệ';
    }
    return { name: `body khớp /${bodyMatch[1]}/`, passed: ok, message: ok ? undefined : msg };
  }

  const header = trimmed.match(/^header\s+([\w-]+)\s*(===?|!=|contains)\s*(.+)$/i);
  if (header) {
    const actual = res.headers[header[1].toLowerCase()] ?? '';
    const expected = header[3].trim().replace(/^["']|["']$/g, '');
    const op = header[2].toLowerCase();
    const ok =
      op === 'contains'
        ? actual.toLowerCase().includes(expected.toLowerCase())
        : op === '!='
          ? actual !== expected
          : actual === expected;
    return { name: `header ${header[1]} ${op} ${expected}`, passed: ok, message: ok ? undefined : `nhận "${actual}"` };
  }

  const jsonCmp = trimmed.match(/^json\s+([\w.[\]]+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/i);
  if (jsonCmp) {
    const actual = getPath(res.data, jsonCmp[1]);
    const num = Number(actual);
    const ok = !Number.isNaN(num) && cmp(num, jsonCmp[2], Number(jsonCmp[3]));
    return { name: `json ${jsonCmp[1]} ${jsonCmp[2]} ${jsonCmp[3]}`, passed: ok, message: ok ? undefined : `nhận ${JSON.stringify(actual)}` };
  }

  const jsonEq = trimmed.match(/^json\s+([\w.[\]]+)\s*(===?|!=)\s*(.+)$/i);
  if (jsonEq) {
    const actual = getPath(res.data, jsonEq[1]);
    let expected = jsonEq[3].trim().replace(/^["']|["']$/g, '');
    if (/^\d+(\.\d+)?$/.test(jsonEq[3].trim())) expected = Number(jsonEq[3].trim());
    else if (jsonEq[3].trim() === 'true') expected = true;
    else if (jsonEq[3].trim() === 'false') expected = false;
    const neg = jsonEq[2] === '!=';
    const eq = actual === expected || String(actual) === String(expected);
    const ok = neg ? !eq : eq;
    return { name: `json ${jsonEq[1]} ${jsonEq[2]} ${jsonEq[3].trim()}`, passed: ok, message: ok ? undefined : `nhận ${JSON.stringify(actual)}` };
  }

  const timeCmp = trimmed.match(/^time\s*(>=|<=|>|<)\s*(\d+)$/i);
  if (timeCmp) {
    const limit = Number(timeCmp[2]);
    const ok = cmp(res.durationMs, timeCmp[1], limit);
    return { name: `time ${timeCmp[1]} ${limit}ms`, passed: ok, message: ok ? undefined : `mất ${res.durationMs}ms` };
  }

  return { name: trimmed, passed: false, message: 'không hiểu cú pháp' };
}

function runTests(script, res) {
  return String(script ?? '')
    .split('\n')
    .map((line) => evalLine(line, res))
    .filter((r) => r !== null);
}

// --- Đọc collection: code-export (.http) hoặc JSON export --------------------

function splitKv(rest) {
  const eq = rest.indexOf('=');
  if (eq < 0) return [rest.trim(), ''];
  return [rest.slice(0, eq).trim(), rest.slice(eq + 1)];
}

function blankRequest() {
  return {
    protocol: 'http',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    bodyType: 'none',
    body: '',
    formData: [],
    graphqlVars: '',
    auth: { type: 'none', bearerToken: '', basicUser: '', basicPass: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header' },
    tests: '',
    responseSchema: '',
    preScript: '',
    postScript: '',
    autoToken: true,
  };
}

function parseCodeExport(text) {
  const lines = text.split(/\r?\n/);
  const collections = [];
  let col = null;
  let path = [];
  let req = null;
  let pending = null;
  let expectMethod = false;

  const container = () => {
    if (!col) {
      col = { name: 'Imported', requests: [], folders: [] };
      collections.push(col);
    }
    let node = col;
    for (const seg of path) {
      let next = node.folders.find((f) => f.name === seg);
      if (!next) {
        next = { name: seg, requests: [], folders: [] };
        node.folders.push(next);
      }
      node = next;
    }
    return node;
  };

  const flush = () => {
    if (pending && req) pending.target.requests.push({ name: pending.name, request: req });
    pending = null;
    req = null;
  };

  const readBlock = (start) => {
    const acc = [];
    let j = start;
    while (j < lines.length && (lines[j] === '' || lines[j].startsWith('  '))) {
      acc.push(lines[j] === '' ? '' : lines[j].slice(2));
      j++;
    }
    while (acc.length && acc[acc.length - 1] === '') acc.pop();
    return [acc.join('\n'), j];
  };

  const pushKv = (list, rest, enabled) => {
    const [key, value] = splitKv(rest);
    list.push({ enabled, key, value });
  };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    if (expectMethod && req) {
      const sp = line.indexOf(' ');
      req.method = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      req.url = sp < 0 ? '' : line.slice(sp + 1);
      expectMethod = false;
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      req = blankRequest();
      pending = { name: line.slice(4).trim(), target: container() };
      expectMethod = true;
      i++;
      continue;
    }
    if (line.startsWith('== collection:')) {
      flush();
      col = { name: line.slice(14).trim(), requests: [], folders: [] };
      collections.push(col);
      path = [];
      i++;
      continue;
    }
    if (line.startsWith('>> folder:')) {
      flush();
      path = line.slice(10).trim().split(' / ');
      container();
      i++;
      continue;
    }
    if (line.startsWith('#') || line.trim() === '') {
      i++;
      continue;
    }
    if (req) {
      if (line.startsWith('protocol:')) req.protocol = line.slice(9).trim();
      else if (line.startsWith('autoToken:')) req.autoToken = line.slice(10).trim() !== 'false';
      else if (line.startsWith('auth.')) {
        const [field, value] = splitKv(line.slice(5));
        if (field === 'apiKeyIn') req.auth.apiKeyIn = value === 'query' ? 'query' : 'header';
        else if (field in req.auth) req.auth[field] = value;
      } else if (line.startsWith('auth:')) req.auth.type = line.slice(5).trim();
      else if (line.startsWith('bodyType:')) req.bodyType = line.slice(9).trim();
      else if (line.startsWith('header-off ')) pushKv(req.headers, line.slice(11), false);
      else if (line.startsWith('header ')) pushKv(req.headers, line.slice(7), true);
      else if (line.startsWith('query-off ')) pushKv(req.params, line.slice(10), false);
      else if (line.startsWith('query ')) pushKv(req.params, line.slice(6), true);
      else if (line.startsWith('form-off ')) pushKv(req.formData, line.slice(9), false);
      else if (line.startsWith('form ')) pushKv(req.formData, line.slice(5), true);
      else if (line === 'body:') {
        const [c, n] = readBlock(i + 1);
        req.body = c;
        i = n;
        continue;
      } else if (line === 'graphqlVars:') {
        const [c, n] = readBlock(i + 1);
        req.graphqlVars = c;
        i = n;
        continue;
      } else if (line === 'tests:') {
        const [c, n] = readBlock(i + 1);
        req.tests = c;
        i = n;
        continue;
      } else if (line === 'responseSchema:') {
        const [c, n] = readBlock(i + 1);
        req.responseSchema = c;
        i = n;
        continue;
      } else if (line === 'preScript:') {
        const [c, n] = readBlock(i + 1);
        req.preScript = c;
        i = n;
        continue;
      } else if (line === 'postScript:') {
        const [c, n] = readBlock(i + 1);
        req.postScript = c;
        i = n;
        continue;
      }
    }
    i++;
  }
  flush();
  return collections;
}

function loadCollections(path) {
  const text = readFileSync(path, 'utf-8');
  if (text.trimStart().startsWith('# curly tests-as-code')) return parseCodeExport(text);
  const data = JSON.parse(text);
  if (Array.isArray(data.collections)) return data.collections;
  if (Array.isArray(data.item)) throw new Error('File Postman chưa hỗ trợ. Hãy export dạng curly hoặc tests-as-code.');
  throw new Error('File không phải code-export (.http) hay JSON export của curly.');
}

function loadEnv(path) {
  if (!path) return {};
  const text = readFileSync(path, 'utf-8');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
  }
  const fromVars = (vars) => {
    const out = {};
    for (const v of vars ?? []) {
      if (v.enabled === false) continue;
      if (v.key && v.key.trim()) out[v.key.trim()] = v.value ?? '';
    }
    return out;
  };
  if (data.environment && Array.isArray(data.environment.variables)) return fromVars(data.environment.variables);
  if (Array.isArray(data.variables)) return fromVars(data.variables);
  if (Array.isArray(data.environments)) {
    let out = {};
    for (const e of data.environments) out = { ...out, ...fromVars(e.variables) };
    return out;
  }
  if (data && typeof data === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(data)) out[k] = String(v);
    return out;
  }
  return {};
}

// --- Duyệt cây & chạy --------------------------------------------------------

function collectRequests(container, prefix, acc) {
  for (const r of container.requests ?? []) acc.push({ label: prefix + r.name, request: r.request });
  for (const f of container.folders ?? []) collectRequests(f, `${prefix}${f.name} / `, acc);
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.path) {
    console.error('Cách dùng: node scripts/run-tests.mjs <file> [--env env.json]');
    process.exitCode = 2;
    return;
  }

  const collections = loadCollections(args.path);
  const vars = loadEnv(args.env);

  const items = [];
  for (const col of collections) collectRequests(col, `${col.name} / `, items);

  let totalPass = 0;
  let totalFail = 0;
  let requestErrors = 0;
  const runnable = items.filter((it) => it.request.tests && it.request.tests.trim());

  console.log(`\ncurly tests-as-code · ${runnable.length}/${items.length} request có assertion\n`);

  for (const it of runnable) {
    const req = it.request;
    if (req.protocol && req.protocol !== 'http') {
      console.log(`${DIM}∘ ${it.label} (bỏ qua protocol ${req.protocol})${RESET}`);
      continue;
    }
    let res;
    try {
      res = await sendRequest(req, vars);
    } catch (err) {
      requestErrors++;
      console.log(`${RED}✗ ${it.label}${RESET}\n    ${err.message}`);
      continue;
    }
    const results = runTests(req.tests, res);
    const failed = results.filter((r) => !r.passed);
    const head = failed.length ? RED + '✗' : GREEN + '✓';
    console.log(`${head} ${it.label}${RESET} ${DIM}[${res.status} · ${res.durationMs}ms]${RESET}`);
    for (const r of results) {
      if (r.passed) {
        totalPass++;
        console.log(`    ${GREEN}✓${RESET} ${r.name}`);
      } else {
        totalFail++;
        console.log(`    ${RED}✗${RESET} ${r.name}${r.message ? ` — ${r.message}` : ''}`);
      }
    }
  }

  const failing = totalFail + requestErrors;
  console.log(
    `\n${failing ? RED : GREEN}Tổng: ${totalPass} pass, ${totalFail} fail` +
      (requestErrors ? `, ${requestErrors} request lỗi` : '') +
      RESET +
      '\n',
  );
  process.exitCode = failing ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 2;
});
