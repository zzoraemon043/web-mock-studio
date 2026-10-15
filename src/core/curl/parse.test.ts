import { describe, expect, it } from 'vitest';
import { parseCurl } from './parse.ts';
import { toCurl, toFetch } from './serialize.ts';
import { tokenizeShell } from './tokenize.ts';

const header = (parsed: ReturnType<typeof parseCurl>, name: string) =>
  parsed.headers.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

describe('tokenizeShell', () => {
  it('handles quotes, escapes and line continuations', () => {
    expect(tokenizeShell(`curl 'a b' "c \\"d\\"" e\\ f \\\n  g`)).toEqual(['curl', 'a b', 'c "d"', 'e f', 'g']);
  });

  it('handles ANSI-C quoting', () => {
    expect(tokenizeShell(`curl $'line1\\nline2\\x41\\''`)).toEqual(['curl', "line1\nline2A'"]);
  });

  it('handles Windows cmd escapes', () => {
    expect(tokenizeShell('curl "https://x.dev/api" ^\n  -H "a: b" ^\n  --data-raw "^{^\\^"k^\\^":1^}"')).toEqual([
      'curl', 'https://x.dev/api', '-H', 'a: b', '--data-raw', '{"k":1}',
    ]);
  });

  it('rejects unterminated quotes', () => {
    expect(() => tokenizeShell(`curl 'oops`)).toThrow(/Unterminated/);
  });
});

describe('parseCurl', () => {
  it('parses a Chrome "Copy as cURL" command', () => {
    const parsed = parseCurl(`curl 'https://api.example.com/v1/users?page=2' \\
  -H 'accept: application/json' \\
  -H 'authorization: Bearer abc.def' \\
  --compressed`);
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('https://api.example.com/v1/users?page=2');
    expect(header(parsed, 'authorization')).toBe('Bearer abc.def');
    expect(parsed.options.compressed).toBe(true);
    expect(parsed.warnings).toEqual([]);
  });

  it('infers POST and JSON body from --data-raw', () => {
    const parsed = parseCurl(`curl https://x.dev/login -H 'Content-Type: application/json' --data-raw '{"email":"a@b.c"}'`);
    expect(parsed.method).toBe('POST');
    expect(parsed.bodyKind).toBe('json');
    expect(parsed.body).toBe('{"email":"a@b.c"}');
  });

  it('supports explicit methods, attached values and long --opt=value', () => {
    expect(parseCurl('curl -XDELETE https://x.dev/a/1').method).toBe('DELETE');
    expect(parseCurl('curl --request=PATCH https://x.dev/a/1 -d x=1').method).toBe('PATCH');
    expect(parseCurl('curl -sSLX PUT https://x.dev/a').method).toBe('PUT');
  });

  it('joins multiple -d values with & and defaults to form encoding', () => {
    const parsed = parseCurl('curl https://x.dev/form -d a=1 -d b=2');
    expect(parsed.body).toBe('a=1&b=2');
    expect(parsed.bodyKind).toBe('form');
    expect(header(parsed, 'content-type')).toBe('application/x-www-form-urlencoded');
  });

  it('encodes --data-urlencode values', () => {
    expect(parseCurl(`curl https://x.dev --data-urlencode 'q=hello world&more'`).body).toBe('q=hello%20world%26more');
  });

  it('moves data into the query string with -G', () => {
    const parsed = parseCurl('curl -G https://x.dev/search?x=1 -d q=ada -d limit=5');
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('https://x.dev/search?x=1&q=ada&limit=5');
    expect(parsed.body).toBe('');
  });

  it('applies --json defaults', () => {
    const parsed = parseCurl(`curl --json '{"a":1}' https://x.dev/items`);
    expect(parsed.method).toBe('POST');
    expect(header(parsed, 'content-type')).toBe('application/json');
    expect(header(parsed, 'accept')).toBe('application/json');
  });

  it('converts -u, -b, -A and -e into headers', () => {
    const parsed = parseCurl(`curl -u 'user:pa:ss' -b 'sid=1; theme=dark' -A 'Agent/1.0' -e https://ref.dev https://x.dev`);
    expect(header(parsed, 'authorization')).toBe(`Basic ${btoa('user:pa:ss')}`);
    expect(header(parsed, 'cookie')).toBe('sid=1; theme=dark');
    expect(header(parsed, 'user-agent')).toBe('Agent/1.0');
    expect(header(parsed, 'referer')).toBe('https://ref.dev');
  });

  it('records multipart form fields and warns about files', () => {
    const parsed = parseCurl('curl -F name=ada -F avatar=@me.png https://x.dev/upload');
    expect(parsed.method).toBe('POST');
    expect(parsed.bodyKind).toBe('multipart');
    expect(parsed.form.map((f) => f.key)).toEqual(['name', 'avatar']);
    expect(parsed.warnings.some((w) => w.includes('me.png'))).toBe(true);
  });

  it('uses HEAD for -I and adds a scheme to bare hosts', () => {
    const parsed = parseCurl('curl -I example.com/health');
    expect(parsed.method).toBe('HEAD');
    expect(parsed.url).toBe('http://example.com/health');
  });

  it('skips ignored flags with values and warns on unknown ones', () => {
    const parsed = parseCurl('curl -o out.json --max-time 5 --frobnicate https://x.dev');
    expect(parsed.url).toBe('https://x.dev');
    expect(parsed.warnings).toEqual(['Unsupported option ignored: --frobnicate']);
  });

  it('accepts a leading shell prompt', () => {
    expect(parseCurl('$ curl https://x.dev').url).toBe('https://x.dev');
  });

  it('rejects non-curl input and missing URLs', () => {
    expect(() => parseCurl('wget https://x.dev')).toThrow(/curl/);
    expect(() => parseCurl('curl -H "a: b"')).toThrow(/No URL/);
    expect(() => parseCurl('')).toThrow();
  });
});

describe('serializers', () => {
  const spec = {
    method: 'POST',
    url: 'https://x.dev/items',
    headers: [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-Off', value: '1', enabled: false },
    ],
    body: `{"name":"it's"}`,
  };

  it('round-trips through toCurl and parseCurl', () => {
    const parsed = parseCurl(toCurl(spec));
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe(spec.url);
    expect(parsed.body).toBe(spec.body);
    expect(parsed.headers).toEqual([{ key: 'Content-Type', value: 'application/json', enabled: true }]);
    expect(parseCurl(toCurl({ ...spec, method: 'PUT' })).method).toBe('PUT');
    expect(parseCurl(toCurl({ ...spec, method: 'DELETE', body: '' })).method).toBe('DELETE');
  });

  it('emits fetch code without disabled headers', () => {
    const code = toFetch(spec);
    expect(code).toContain('method: "POST"');
    expect(code).not.toContain('X-Off');
  });
});
