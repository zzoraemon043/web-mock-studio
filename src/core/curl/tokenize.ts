/**
 * POSIX-shell-style word splitter covering what browsers and API tools emit for
 * "Copy as cURL": single quotes, double quotes with backslash escapes, ANSI-C `$'...'`
 * strings, backslash-newline continuations, and Windows cmd `^` continuations/escapes.
 */
export function tokenizeShell(input: string): string[] {
  const src = normalizeContinuations(input);
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let i = 0;

  const push = () => {
    if (inToken) tokens.push(current);
    current = '';
    inToken = false;
  };

  while (i < src.length) {
    const ch = src[i] as string;

    if (/\s/.test(ch)) {
      push();
      i++;
      continue;
    }

    if (ch === "'") {
      inToken = true;
      const end = src.indexOf("'", i + 1);
      if (end === -1) throw new Error('Unterminated single-quoted string');
      current += src.slice(i + 1, end);
      i = end + 1;
      continue;
    }

    if (ch === '$' && src[i + 1] === "'") {
      inToken = true;
      const [value, next] = readAnsiC(src, i + 2);
      current += value;
      i = next;
      continue;
    }

    if (ch === '"') {
      inToken = true;
      i++;
      let closed = false;
      while (i < src.length) {
        const c = src[i] as string;
        if (c === '\\' && i + 1 < src.length) {
          const n = src[i + 1] as string;
          current += '"\\$`\n'.includes(n) ? (n === '\n' ? '' : n) : `\\${n}`;
          i += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        current += c;
        i++;
      }
      if (!closed) throw new Error('Unterminated double-quoted string');
      continue;
    }

    if (ch === '\\' && i + 1 < src.length) {
      inToken = true;
      current += src[i + 1];
      i += 2;
      continue;
    }

    inToken = true;
    current += ch;
    i++;
  }
  push();
  return tokens;
}

function normalizeContinuations(input: string): string {
  let text = input.replace(/\r\n?/g, '\n').replace(/\\\n/g, ' ');
  if (/\^\n/.test(text) || /\^"/.test(text)) {
    text = text.replace(/\^\n/g, ' ').replace(/\^(.)/g, '$1');
  }
  return text.trim();
}

const ANSI_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', '0': '\0' };

function readAnsiC(src: string, start: number): [string, number] {
  let out = '';
  let i = start;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "'") return [out, i + 1];
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1] as string;
      if (n === 'x') {
        const hex = /^[0-9a-fA-F]{1,2}/.exec(src.slice(i + 2))?.[0] ?? '';
        out += String.fromCharCode(parseInt(hex || '0', 16));
        i += 2 + hex.length;
        continue;
      }
      if (n === 'u') {
        const hex = /^[0-9a-fA-F]{1,4}/.exec(src.slice(i + 2))?.[0] ?? '';
        out += String.fromCharCode(parseInt(hex || '0', 16));
        i += 2 + hex.length;
        continue;
      }
      out += ANSI_ESCAPES[n] ?? `\\${n}`;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  throw new Error("Unterminated $'...' string");
}
