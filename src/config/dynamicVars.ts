import type { CustomDynamicVar } from '../types/request';

export interface DynamicVarInfo {
  token: string;
  desc: string;
}

let customVars: CustomDynamicVar[] = [];

export function setCustomDynamicVars(list: CustomDynamicVar[]): void {
  customVars = Array.isArray(list) ? list : [];
}

const TOKEN_RE = /\{\{\s*([\w.$:-]+)\s*\}\}/g;

const FIRST_NAMES = [
  'Alex',
  'Bao',
  'Chi',
  'Dan',
  'Emma',
  'Hana',
  'Ian',
  'Julia',
  'Kevin',
  'Lena',
  'Minh',
  'Nina',
  'Oscar',
  'Paula',
  'Quan',
  'Rosa',
  'Son',
  'Tina',
  'Uyen',
  'Vera',
];

const LAST_NAMES = [
  'Nguyen',
  'Tran',
  'Le',
  'Pham',
  'Hoang',
  'Smith',
  'Jones',
  'Brown',
  'Davis',
  'Wilson',
];

const WORDS = [
  'apple',
  'river',
  'cloud',
  'forest',
  'mountain',
  'wind',
  'sun',
  'moon',
  'star',
  'flower',
  'stone',
  'ocean',
  'valley',
  'meadow',
  'garden',
  'harbor',
];

const DOMAINS = ['example.com', 'mail.com', 'test.dev', 'demo.io', 'curly.app'];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomHexColor(): string {
  const n = Math.floor(Math.random() * 0xffffff);
  return '#' + n.toString(16).padStart(6, '0');
}

const BASES = new Set([
  '$uuid',
  '$timestamp',
  '$isoTimestamp',
  '$randomInt',
  '$randomEmail',
  '$randomFirstName',
  '$randomLastName',
  '$randomFullName',
  '$randomBoolean',
  '$randomWord',
  '$randomColor',
  '$randomUrl',
  '$randomIp',
]);

function findCustom(base: string): CustomDynamicVar | undefined {
  return customVars.find((c) => '$' + c.name === base);
}

export function isDynamicVar(name: string): boolean {
  const base = name.split(':')[0];
  return BASES.has(base) || findCustom(base) !== undefined;
}

function resolveTemplate(tpl: string, depth: number): string {
  return tpl.replace(TOKEN_RE, (whole, n: string) => {
    const g = generate(n, depth);
    return g !== null ? g : whole;
  });
}

function generate(name: string, depth: number): string | null {
  if (!name.startsWith('$')) return null;
  const parts = name.split(':');
  const base = parts[0];
  switch (base) {
    case '$uuid':
      return crypto.randomUUID();
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$randomInt': {
      if (parts.length >= 3) {
        const min = Number(parts[1]);
        const max = Number(parts[2]);
        if (!Number.isNaN(min) && !Number.isNaN(max) && min <= max)
          return String(randInt(min, max));
      }
      return String(randInt(0, 1000));
    }
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
    case '$randomColor':
      return randomHexColor();
    case '$randomUrl':
      return `https://${pick(WORDS)}.${pick(DOMAINS)}`;
    case '$randomIp':
      return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
    default: {
      if (depth >= 6) return null;
      const custom = findCustom(base);
      if (custom) return resolveTemplate(custom.template, depth + 1);
      return null;
    }
  }
}

export function resolveDynamic(name: string): string | null {
  return generate(name, 0);
}

export const DYNAMIC_VARS: DynamicVarInfo[] = [
  { token: '$uuid', desc: 'UUID v4 ngẫu nhiên' },
  { token: '$timestamp', desc: 'Unix timestamp (giây)' },
  { token: '$isoTimestamp', desc: 'Thời gian hiện tại dạng ISO 8601' },
  { token: '$randomInt', desc: 'Số nguyên 0–1000 (hoặc {{$randomInt:min:max}})' },
  { token: '$randomEmail', desc: 'Địa chỉ email ngẫu nhiên' },
  { token: '$randomFirstName', desc: 'Tên ngẫu nhiên' },
  { token: '$randomLastName', desc: 'Họ ngẫu nhiên' },
  { token: '$randomFullName', desc: 'Họ và tên ngẫu nhiên' },
  { token: '$randomBoolean', desc: 'true hoặc false' },
  { token: '$randomWord', desc: 'Một từ ngẫu nhiên' },
  { token: '$randomColor', desc: 'Mã màu hex ngẫu nhiên' },
  { token: '$randomUrl', desc: 'URL ngẫu nhiên' },
  { token: '$randomIp', desc: 'Địa chỉ IPv4 ngẫu nhiên' },
];
