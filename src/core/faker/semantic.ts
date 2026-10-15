import type { FakerKind } from './kinds.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}){1,2}$/i;

export type ValueFormat = 'uuid' | 'email' | 'date-time' | 'date' | 'uri' | 'ipv4' | 'color';

export function detectStringFormat(value: string): ValueFormat | undefined {
  if (UUID_RE.test(value)) return 'uuid';
  if (EMAIL_RE.test(value)) return 'email';
  if (ISO_DATETIME_RE.test(value)) return 'date-time';
  if (DATE_RE.test(value)) return 'date';
  if (URL_RE.test(value)) return 'uri';
  if (IPV4_RE.test(value)) return 'ipv4';
  if (HEX_COLOR_RE.test(value)) return 'color';
  return undefined;
}

/** Splits camelCase, snake_case, kebab-case and dotted keys into lowercase tokens. */
export function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

interface KeyRule {
  match: (tokens: string[], joined: string) => boolean;
  kind: FakerKind | ((value: unknown) => FakerKind | undefined);
}

const has = (...names: string[]) => (tokens: string[]) => names.some((n) => tokens.includes(n));
const last = (...names: string[]) => (tokens: string[]) => names.includes(tokens[tokens.length - 1] ?? '');
const joinedIs = (...names: string[]) => (_: string[], joined: string) => names.includes(joined);

const isTimeKey = (tokens: string[], joined: string) =>
  last('at', 'on', 'time', 'timestamp', 'date', 'datetime', 'ts')(tokens) ||
  joinedIs('created', 'updated', 'deleted', 'modified', 'expires', 'birthday', 'dob')(tokens, joined);

function timeKindFor(value: unknown): FakerKind {
  if (typeof value === 'number') return value > 1e11 ? 'unixMillis' : 'unixSeconds';
  if (typeof value === 'string' && DATE_RE.test(value)) return 'date';
  return 'isoDateTime';
}

/**
 * Ordered rules: the first match wins, so more specific names (firstName, avatarUrl)
 * must precede broader ones (name, url). Value shape breaks ties where key names are
 * ambiguous, e.g. a numeric `id` becomes a sequence while a string `id` becomes a UUID.
 */
const KEY_RULES: KeyRule[] = [
  { match: last('id', 'uuid', 'guid', 'key'), kind: (v) => (typeof v === 'number' ? 'sequence' : typeof v === 'string' && OBJECT_ID_RE.test(v) ? 'objectId' : 'uuid') },
  { match: has('email', 'mail'), kind: 'email' },
  { match: has('avatar', 'photo', 'picture', 'portrait', 'headshot'), kind: 'avatar' },
  { match: joinedIs('firstname', 'givenname', 'forename', 'first'), kind: 'firstName' },
  { match: (t, j) => (has('first', 'given')(t) && has('name')(t)) || j === 'fname', kind: 'firstName' },
  { match: (t, j) => (has('last', 'family', 'sur')(t) && has('name')(t)) || ['surname', 'lastname', 'lname'].includes(j), kind: 'lastName' },
  { match: (t, j) => has('username', 'login', 'handle', 'nickname', 'screenname')(t) || (has('user')(t) && has('name')(t)) || j === 'nick', kind: 'username' },
  { match: (t) => has('company', 'organization', 'organisation', 'employer', 'org')(t), kind: 'companyName' },
  { match: (t) => has('product', 'item', 'sku')(t) && has('name', 'title')(t), kind: 'productName' },
  { match: (t) => has('job', 'occupation', 'position')(t) || (has('role')(t) && has('title')(t)), kind: 'jobTitle' },
  { match: (t, j) => has('fullname', 'displayname', 'author', 'owner', 'customer', 'assignee')(t) || ['name', 'displayname', 'fullname'].includes(j) || (has('name')(t) && has('full', 'display', 'contact')(t)), kind: (v) => (typeof v === 'string' ? 'fullName' : undefined) },
  { match: has('phone', 'mobile', 'tel', 'telephone', 'fax', 'cell'), kind: 'phone' },
  { match: (t) => has('street', 'address', 'addr')(t) && !has('ip', 'email', 'mac')(t), kind: 'streetAddress' },
  { match: has('city', 'town'), kind: 'city' },
  { match: (t) => has('country')(t) && has('code', 'iso')(t), kind: 'countryCode' },
  { match: has('country', 'nation'), kind: 'country' },
  { match: has('zip', 'zipcode', 'postal', 'postcode'), kind: 'zipCode' },
  { match: has('lat', 'latitude'), kind: 'latitude' },
  { match: (t, j) => has('lng', 'lon', 'longitude')(t) || j === 'long', kind: 'longitude' },
  { match: (t) => has('ip')(t) || has('ipv4')(t), kind: 'ipv4' },
  { match: has('domain', 'hostname', 'host'), kind: 'domain' },
  { match: has('url', 'uri', 'link', 'href', 'website', 'homepage', 'image', 'thumbnail', 'logo', 'icon'), kind: 'url' },
  { match: has('slug', 'permalink'), kind: 'slug' },
  { match: has('color', 'colour'), kind: 'hexColor' },
  { match: has('token', 'secret', 'hash', 'checksum', 'sha', 'nonce', 'apikey'), kind: 'token' },
  { match: has('currency'), kind: 'currency' },
  { match: has('price', 'amount', 'cost', 'total', 'subtotal', 'balance', 'salary', 'fee', 'revenue'), kind: (v) => (typeof v === 'number' && Number.isInteger(v) ? 'integer' : 'price') },
  { match: has('percent', 'percentage', 'progress', 'ratio', 'rate'), kind: (v) => (typeof v === 'number' && v <= 1 && v >= 0 ? 'float' : 'percentage') },
  { match: isTimeKey, kind: timeKindFor },
  { match: has('title', 'headline', 'subject', 'label', 'heading'), kind: 'title' },
  { match: has('description', 'bio', 'summary', 'about', 'content', 'body', 'text', 'comment', 'message', 'note', 'notes', 'excerpt'), kind: (v) => (typeof v === 'string' && v.length > 120 ? 'paragraph' : 'sentence') },
  { match: (t, j) => j === 'name' || has('name')(t), kind: (v) => (typeof v === 'string' ? 'title' : undefined) },
  { match: has('word', 'tag', 'keyword', 'category', 'type', 'kind'), kind: 'word' },
];

const FORMAT_KINDS: Record<ValueFormat, FakerKind> = {
  uuid: 'uuid',
  email: 'email',
  'date-time': 'isoDateTime',
  date: 'date',
  uri: 'url',
  ipv4: 'ipv4',
  color: 'hexColor',
};

/**
 * Value formats are authoritative over key names: a field called `link` holding an
 * email address is generated as an email. Key semantics then refine plain strings
 * and numbers, falling back to type-only generators.
 */
export function detectKind(key: string | undefined, value: unknown): FakerKind | undefined {
  if (typeof value === 'string') {
    const format = detectStringFormat(value);
    if (format === 'uri' && key && has('avatar', 'photo', 'picture')(tokenizeKey(key))) return 'avatar';
    if (format) return FORMAT_KINDS[format];
  }
  if (typeof value === 'boolean') return 'boolean';
  if (key) {
    const tokens = tokenizeKey(key);
    const joined = tokens.join('');
    for (const rule of KEY_RULES) {
      if (!rule.match(tokens, joined)) continue;
      const kind = typeof rule.kind === 'function' ? rule.kind(value) : rule.kind;
      if (!kind) continue;
      if (typeof value === 'number' && !NUMERIC_KINDS.has(kind)) continue;
      if (typeof value === 'string' && NUMERIC_ONLY_KINDS.has(kind)) continue;
      return kind;
    }
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
  if (typeof value === 'string') return 'word';
  return undefined;
}

const NUMERIC_KINDS = new Set<FakerKind>([
  'sequence', 'latitude', 'longitude', 'price', 'unixSeconds', 'unixMillis', 'integer', 'float', 'percentage',
]);

const NUMERIC_ONLY_KINDS = new Set<FakerKind>(['sequence', 'integer', 'float', 'percentage', 'unixSeconds', 'unixMillis']);
