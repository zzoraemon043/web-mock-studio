import { useMemo, useState } from 'react';
import { ArrowRight, Route, TriangleAlert } from 'lucide-react';
import { parseCurl, type ParsedCurl } from '../../core/curl/parse.ts';
import { Modal } from '../../components/Modal.tsx';
import { Badge, Button, MethodTag } from '../../components/ui.tsx';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { useUi } from '../../store/ui.ts';
import { createAndSelectRule } from '../../app/actions.ts';
import { patternFromUrl } from './requestUtils.ts';

const PLACEHOLDER = `curl 'https://api.example.com/v1/users?page=2' \\
  -H 'accept: application/json' \\
  -H 'authorization: Bearer <token>'`;

export function CurlImportModal() {
  const open = useUi((s) => s.curlImportOpen);
  const setOpen = useUi((s) => s.setCurlImportOpen);
  const openInRunner = useUi((s) => s.openInRunner);
  const toast = useUi((s) => s.toast);
  const [text, setText] = useState('');

  const result = useMemo((): { parsed?: ParsedCurl; error?: string } => {
    if (!text.trim()) return {};
    try {
      return { parsed: parseCurl(text) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [text]);

  const close = () => setOpen(false);
  const parsed = result.parsed;
  const body = parsed ? (parsed.bodyKind === 'multipart' ? parsed.form.map((f) => `${f.key}=${f.value}`).join('&') : parsed.body) : '';

  const load = () => {
    if (!parsed) return;
    openInRunner({ method: parsed.method, url: parsed.url, headers: parsed.headers, body });
    setText('');
    close();
    toast('cURL command loaded into the runner', 'success');
  };

  const toRule = () => {
    if (!parsed) return;
    createAndSelectRule({
      name: `${parsed.method} ${patternFromUrl(parsed.url)}`,
      method: parsed.method,
      pattern: patternFromUrl(parsed.url),
    });
    setText('');
    close();
    toast('Mock rule created from cURL command', 'success');
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import cURL command"
      footer={
        <>
          <Button icon={Route} disabled={!parsed} onClick={toRule}>
            Create mock rule
          </Button>
          <Button variant="primary" icon={ArrowRight} disabled={!parsed} onClick={load}>
            Load into runner
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-muted">
        Paste a command from browser DevTools (Copy as cURL, bash or cmd), Postman, Insomnia or documentation. Parsing happens locally; nothing is sent anywhere.
      </p>
      <CodeEditor label="cURL command" value={text} onChange={setText} placeholder={PLACEHOLDER} minHeight={180} className="h-48" onSubmit={load} />
      {result.error && <p className="mt-2 text-xs text-bad">{result.error}</p>}
      {parsed && (
        <div className="mt-3 rounded-md border border-line bg-subtle p-3 text-xs">
          <div className="flex items-center gap-2">
            <MethodTag method={parsed.method} className="w-auto" />
            <span className="min-w-0 truncate font-mono">{parsed.url}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{parsed.headers.length} headers</Badge>
            <Badge>body: {parsed.bodyKind}</Badge>
            {parsed.options.compressed && <Badge>compressed</Badge>}
            {parsed.options.insecure && <Badge tone="warn">insecure (ignored by browsers)</Badge>}
            {parsed.options.followRedirects && <Badge>follow redirects</Badge>}
          </div>
          {parsed.headers.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-auto font-mono text-[11px] text-muted">
              {parsed.headers.map((h, i) => (
                <li key={i} className="truncate">
                  <span className="text-fg">{h.key}</span>: {h.value}
                </li>
              ))}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-[11px] text-warn">
              {parsed.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <TriangleAlert size={12} className="mt-px shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
