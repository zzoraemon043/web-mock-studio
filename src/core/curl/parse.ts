import { HTTP_METHODS, type HttpMethod, type KeyValue } from '../types.ts';
import { tokenizeShell } from './tokenize.ts';

export type BodyKind = 'none' | 'json' | 'form' | 'multipart' | 'raw';

export interface ParsedCurl {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  body: string;
  bodyKind: BodyKind;
  form: KeyValue[];
  options: {
    insecure: boolean;
    compressed: boolean;
    followRedirects: boolean;
  };
  warnings: string[];
}

type DataFlag = 'data' | 'raw' | 'binary' | 'urlencode' | 'json';

const DATA_FLAGS: Record<string, DataFlag> = {
  '-d': 'data',
  '--data': 'data',
  '--data-ascii': 'data',
  '--data-raw': 'raw',
  '--data-binary': 'binary',
  '--data-urlencode': 'urlencode',
  '--json': 'json',
};

/** Flags that consume the next token but carry nothing the request model needs. */
const IGNORED_WITH_VALUE = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '--retry', '--retry-delay',
  '--retry-max-time', '-x', '--proxy', '-E', '--cert', '--key', '--cacert', '--capath', '-c', '--cookie-jar',
  '--limit-rate', '--max-redirs', '--resolve', '--interface', '-r', '--range', '-z', '--time-cond', '-K', '--config',
  '--proxy-user', '-U', '--http-version', '-T', '--upload-file', '--max-filesize', '-D', '--dump-header',
]);

const IGNORED_FLAGS = new Set([
  '-s', '--silent', '-S', '--show-error', '-v', '--verbose', '-i', '--include', '-f', '--fail', '-N', '--no-buffer',
  '--http1.1', '--http2', '--http2-prior-knowledge', '--http3', '-#', '--progress-bar', '-n', '--netrc', '--globoff',
  '-g', '--path-as-is', '--tcp-nodelay', '-q', '--disable', '-0', '--http1.0', '--fail-with-body', '--no-progress-meter',
]);

/** Short flags that take a value, used when splitting clustered short options like `-sSLX`. */
const SHORT_WITH_VALUE = new Set(['X', 'H', 'd', 'F', 'u', 'b', 'A', 'e', 'o', 'm', 'w', 'x', 'E', 'c', 'r', 'z', 'K', 'U', 'T', 'D']);

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function expandShortClusters(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    if (/^-[a-zA-Z#0-9]{2,}/.test(token) && !token.startsWith('--')) {
      const letters = token.slice(1);
      for (let i = 0; i < letters.length; i++) {
        const flag = letters[i] as string;
        if (SHORT_WITH_VALUE.has(flag)) {
          out.push(`-${flag}`);
          const attached = letters.slice(i + 1);
          if (attached) out.push(attached);
          break;
        }
        out.push(`-${flag}`);
      }
    } else {
      out.push(token);
    }
  }
  return out;
}

function splitLongEquals(token: string): [string, string | undefined] {
  if (!token.startsWith('--')) return [token, undefined];
  const eq = token.indexOf('=');
  return eq > 2 ? [token.slice(0, eq), token.slice(eq + 1)] : [token, undefined];
}

function headerIndex(headers: KeyValue[], name: string): number {
  const lower = name.toLowerCase();
  return headers.findIndex((h) => h.key.toLowerCase() === lower);
}

function setHeader(headers: KeyValue[], key: string, value: string, overwrite = true): void {
  const idx = headerIndex(headers, key);
  if (idx >= 0) {
    if (overwrite) headers[idx] = { key, value, enabled: true };
    return;
  }
  headers.push({ key, value, enabled: true });
}

function encodeUrlencodeArg(arg: string): string {
  const eq = arg.indexOf('=');
  if (arg.startsWith('@')) return arg;
  if (eq === -1) return encodeURIComponent(arg);
  const name = arg.slice(0, eq);
  return `${name}=${encodeURIComponent(arg.slice(eq + 1))}`;
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function parseCurl(input: string): ParsedCurl {
  const warnings: string[] = [];
  const raw = tokenizeShell(input.trim().replace(/^\$\s+/, ''));
  if (raw.length === 0) throw new Error('Empty command');
  const first = raw[0]?.toLowerCase() ?? '';
  if (!/(^|[\\/])curl(\.exe)?$/.test(first)) throw new Error('Command must start with "curl"');

  const tokens = expandShortClusters(raw.slice(1));
  const headers: KeyValue[] = [];
  const dataParts: { flag: DataFlag; value: string }[] = [];
  const form: KeyValue[] = [];
  let method: string | undefined;
  let url: string | undefined;
  let useGet = false;
  let head = false;
  const options = { insecure: false, compressed: false, followRedirects: false };

  for (let i = 0; i < tokens.length; i++) {
    const [flag, inline] = splitLongEquals(tokens[i] as string);
    const takeValue = (): string => {
      if (inline !== undefined) return inline;
      const value = tokens[++i];
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      return value;
    };

    if (!flag.startsWith('-') || flag === '-') {
      if (url === undefined) url = flag;
      else warnings.push(`Ignored extra argument: ${flag}`);
      continue;
    }

    const dataFlag = DATA_FLAGS[flag];
    if (dataFlag) {
      const value = takeValue();
      if (dataFlag !== 'raw' && value.startsWith('@')) warnings.push(`File reference "${value}" cannot be read in the browser; edit the body manually.`);
      dataParts.push({ flag: dataFlag, value });
      continue;
    }

    switch (flag) {
      case '-X':
      case '--request':
        method = takeValue().toUpperCase();
        break;
      case '-H':
      case '--header': {
        const value = takeValue();
        const colon = value.indexOf(':');
        if (colon <= 0) {
          warnings.push(`Malformed header ignored: ${value}`);
          break;
        }
        const key = value.slice(0, colon).trim();
        const headerValue = value.slice(colon + 1).trim();
        if (headerValue === '' && value.trimEnd().endsWith(':')) {
          warnings.push(`Header "${key}" is set to be removed by curl; ignored.`);
          break;
        }
        headers.push({ key, value: headerValue, enabled: true });
        break;
      }
      case '-F':
      case '--form':
      case '--form-string': {
        const value = takeValue();
        const eq = value.indexOf('=');
        if (eq <= 0) {
          warnings.push(`Malformed form field ignored: ${value}`);
          break;
        }
        const fieldValue = value.slice(eq + 1);
        if (flag !== '--form-string' && fieldValue.startsWith('@')) warnings.push(`Form file "${fieldValue.slice(1)}" cannot be attached from the browser.`);
        form.push({ key: value.slice(0, eq), value: fieldValue, enabled: true });
        break;
      }
      case '-u':
      case '--user':
        setHeader(headers, 'Authorization', `Basic ${encodeBase64(takeValue())}`);
        break;
      case '-b':
      case '--cookie': {
        const value = takeValue();
        if (value.includes('=')) setHeader(headers, 'Cookie', value);
        else warnings.push(`Cookie file "${value}" cannot be read in the browser.`);
        break;
      }
      case '-A':
      case '--user-agent':
        setHeader(headers, 'User-Agent', takeValue());
        break;
      case '-e':
      case '--referer':
        setHeader(headers, 'Referer', takeValue());
        break;
      case '--oauth2-bearer':
        setHeader(headers, 'Authorization', `Bearer ${takeValue()}`);
        break;
      case '--url':
        url = takeValue();
        break;
      case '-G':
      case '--get':
        useGet = true;
        break;
      case '-I':
      case '--head':
        head = true;
        break;
      case '-k':
      case '--insecure':
        options.insecure = true;
        break;
      case '--compressed':
        options.compressed = true;
        break;
      case '-L':
      case '--location':
        options.followRedirects = true;
        break;
      default:
        if (IGNORED_WITH_VALUE.has(flag)) {
          takeValue();
        } else if (!IGNORED_FLAGS.has(flag)) {
          warnings.push(`Unsupported option ignored: ${flag}`);
        }
    }
  }

  if (!url) throw new Error('No URL found in command');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;

  let body = '';
  let bodyKind: BodyKind = 'none';
  const hasJsonFlag = dataParts.some((p) => p.flag === 'json');

  if (dataParts.length > 0) {
    const encoded = dataParts.map((p) => (p.flag === 'urlencode' ? encodeUrlencodeArg(p.value) : p.value));
    if (useGet) {
      const target = new URL(url);
      const extra = encoded.join('&');
      target.search = target.search ? `${target.search.slice(1)}&${extra}` : extra;
      url = target.toString();
    } else {
      body = hasJsonFlag ? encoded.join('') : encoded.join('&');
      if (hasJsonFlag) {
        setHeader(headers, 'Content-Type', 'application/json', false);
        setHeader(headers, 'Accept', 'application/json', false);
      }
      const contentType = headers[headerIndex(headers, 'content-type')]?.value.toLowerCase() ?? '';
      if (contentType.includes('json') || looksLikeJson(body)) bodyKind = 'json';
      else if (contentType.includes('x-www-form-urlencoded') || (!contentType && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(body))) bodyKind = 'form';
      else bodyKind = 'raw';
      if (!contentType && !hasJsonFlag) setHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded', false);
    }
  } else if (form.length > 0) {
    bodyKind = 'multipart';
  }

  let resolved: string;
  if (method) resolved = method;
  else if (head) resolved = 'HEAD';
  else if (useGet) resolved = 'GET';
  else if (dataParts.length > 0 || form.length > 0) resolved = 'POST';
  else resolved = 'GET';

  if (!(HTTP_METHODS as readonly string[]).includes(resolved)) {
    warnings.push(`Method ${resolved} is not supported by the runner; using GET.`);
    resolved = 'GET';
  }

  return {
    method: resolved as HttpMethod,
    url,
    headers,
    body,
    bodyKind,
    form,
    options,
    warnings,
  };
}
