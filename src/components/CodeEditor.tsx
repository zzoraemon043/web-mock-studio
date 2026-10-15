import { useMemo, useRef, type KeyboardEvent } from 'react';
import { cx } from '../lib/utils.ts';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  label: string;
  invalid?: boolean;
  onSubmit?: () => void;
}

const INDENT = '  ';

/**
 * Plain textarea editor with a synchronized line-number gutter. A full editor component
 * (Monaco, CodeMirror) would multiply bundle size for features this tool does not need;
 * JSON validity is reported by the surrounding panel instead.
 */
export function CodeEditor({ value, onChange, readOnly, placeholder, className, minHeight = 160, label, invalid, onSubmit }: CodeEditorProps) {
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (readOnly || !onChange) return;
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;

    if (e.key === 'Tab') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (e.shiftKey) {
        if (value.slice(lineStart, lineStart + INDENT.length) === INDENT) {
          const next = value.slice(0, lineStart) + value.slice(lineStart + INDENT.length);
          onChange(next);
          requestAnimationFrame(() => el.setSelectionRange(Math.max(lineStart, start - INDENT.length), Math.max(lineStart, end - INDENT.length)));
        }
        return;
      }
      const next = value.slice(0, start) + INDENT + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(start + INDENT.length, start + INDENT.length));
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, start))?.[0] ?? '';
      const prev = value.slice(0, start).trimEnd().slice(-1);
      const opens = prev === '{' || prev === '[';
      if (!indent && !opens) return;
      e.preventDefault();
      let insert = `\n${indent}${opens ? INDENT : ''}`;
      const caret = start + insert.length;
      const closer = value.charAt(end);
      if (opens && (closer === '}' || closer === ']')) insert += `\n${indent}`;
      onChange(value.slice(0, start) + insert + value.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    }
  };

  return (
    <div
      className={cx(
        'relative flex min-w-0 overflow-hidden rounded-md border bg-code font-mono text-xs leading-5',
        invalid ? 'border-bad/70' : 'border-line focus-within:border-accent',
        className,
      )}
      style={{ minHeight }}
    >
      <div ref={gutter} aria-hidden className="pointer-events-none w-10 shrink-0 overflow-hidden border-r border-line py-2 pr-2 text-right text-faint select-none">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        aria-label={label}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className="min-h-full flex-1 resize-none overflow-auto bg-transparent px-3 py-2 text-fg outline-none placeholder:text-faint"
      />
    </div>
  );
}
