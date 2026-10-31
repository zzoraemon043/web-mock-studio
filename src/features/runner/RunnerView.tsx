import { useEffect, useRef, useState } from 'react';
import { Bookmark, Copy, FileCode, Loader2, Route, Send, Square, TerminalSquare, Trash2, TriangleAlert } from 'lucide-react';
import { HTTP_METHODS, type HttpMethod, type KeyValue } from '../../core/types.ts';
import { toCurl, toFetch } from '../../core/curl/serialize.ts';
import { parseCurl } from '../../core/curl/parse.ts';
import { MOCK_HEADER } from '../../core/mock/resolve.ts';
import { useUi } from '../../store/ui.ts';
import { useWorkspace } from '../../store/workspace.ts';
import { Badge, Button, EmptyState, IconButton, Input, MethodTag, Segmented, Select, statusTone } from '../../components/ui.tsx';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { KeyValueEditor } from '../../components/KeyValueEditor.tsx';
import { copyText, cx, formatBytes, formatJson, modKey } from '../../lib/utils.ts';
import { createAndSelectRule } from '../../app/actions.ts';
import { CurlImportModal } from './CurlImportModal.tsx';
import { diagnoseFailure, invalidHeaderReason, patternFromUrl, tryPrettyJson } from './requestUtils.ts';

interface RunResult {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
  size: number;
  mocked: boolean;
  url: string;
}

interface RunFailure {
  message: string;
  url: string;
  badRequest?: boolean;
}

const BODYLESS = new Set(['GET', 'HEAD']);

export function RunnerView() {
  const consumeDraft = useUi((s) => s.consumeRunnerDraft);
  const draft = useUi((s) => s.runnerDraft);
  const setCurlImportOpen = useUi((s) => s.setCurlImportOpen);
  const toast = useUi((s) => s.toast);
  const requests = useWorkspace((s) => s.requests);
  const saveRequest = useWorkspace((s) => s.saveRequest);
  const removeRequest = useWorkspace((s) => s.removeRequest);

  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('/api/users?page=1&pageSize=5');
  const [headers, setHeaders] = useState<KeyValue[]>([]);
  const [body, setBody] = useState('');
  const [savedId, setSavedId] = useState<string | undefined>();
  const [tab, setTab] = useState<'headers' | 'body'>('headers');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [failure, setFailure] = useState<RunFailure | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const next = consumeDraft();
    if (!next) return;
    setMethod((HTTP_METHODS as readonly string[]).includes(next.method) ? (next.method as HttpMethod) : 'GET');
    setUrl(next.url);
    setHeaders(next.headers);
    setBody(next.body);
    setSavedId(next.savedId);
    setTab(next.body ? 'body' : 'headers');
    setResult(null);
    setFailure(null);
  }, [draft, consumeDraft]);

  useEffect(() => () => abort.current?.abort(), []);

  const spec = { method, url, headers, body };
  const absoluteUrl = (() => {
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  })();

  const send = async () => {
    if (!url.trim()) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSending(true);
    setFailure(null);
    const started = performance.now();
    try {
      const sentHeaders = headers.filter((h) => h.enabled && h.key.trim()).map((h): [string, string] => [h.key.trim(), h.value]);
      const badHeader = invalidHeaderReason(sentHeaders);
      if (badHeader) {
        setResult(null);
        setFailure({ message: badHeader, url: absoluteUrl, badRequest: true });
        return;
      }
      const init: RequestInit = { method, headers: sentHeaders, signal: controller.signal };
      if (!BODYLESS.has(method) && body) init.body = body;
      const response = await fetch(url, init);
      const text = method === 'HEAD' ? '' : await response.text();
      if (controller.signal.aborted) return;
      setResult({
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
        body: text,
        durationMs: Math.round(performance.now() - started),
        size: new Blob([text]).size,
        mocked: response.headers.has(MOCK_HEADER),
        url: response.url || absoluteUrl,
      });
      setResponseTab('body');
    } catch (err) {
      if (controller.signal.aborted) return;
      setResult(null);
      setFailure({ message: err instanceof Error ? err.message : String(err), url: absoluteUrl });
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setSending(false);
      }
    }
  };

  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setSending(false);
  };

  const copy = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast(ok ? `${label} copied` : 'Copy failed', ok ? 'success' : 'error');
  };

  const createMock = () => {
    const contentType = result?.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1];
    createAndSelectRule({
      name: `${method} ${patternFromUrl(url)}`,
      method,
      pattern: patternFromUrl(url),
      response: {
        status: result && result.status >= 200 ? result.status : 200,
        headers: contentType ? [{ key: 'Content-Type', value: contentType, enabled: true }] : [],
        bodyMode: 'inline',
        body: result ? (formatJson(result.body) ?? result.body) : '{\n  "ok": true\n}',
        dataset: { templateId: '', count: 25, envelope: 'array' },
      },
    });
    toast(result ? 'Response captured as a mock rule' : 'Mock rule created for this endpoint', 'success');
  };

  const save = () => {
    const saved = saveRequest({ id: savedId, name: savedId ? requests.find((r) => r.id === savedId)?.name : `${method} ${patternFromUrl(url)}`, method, url, headers, body });
    setSavedId(saved.id);
    toast('Request saved', 'success');
  };

  const diagnosis = failure
    ? failure.badRequest
      ? { title: 'The request was not sent', causes: ['Fix the header in the Headers tab and send again.'] }
      : diagnoseFailure(failure.url, location.origin, location.protocol)
    : null;
  const pretty = result ? tryPrettyJson(result.body) : null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <h3 className="text-xs font-semibold">Saved requests</h3>
          <Button size="sm" icon={TerminalSquare} onClick={() => setCurlImportOpen(true)}>
            cURL
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto p-1.5">
          {requests.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">Saved requests appear here.</li>}
          {requests.map((r) => (
            <li key={r.id} className={cx('group flex items-center gap-1 rounded-md pr-1', r.id === savedId ? 'bg-accent-soft' : 'hover:bg-hover')}>
              <button
                type="button"
                onClick={() => {
                  setMethod(r.method);
                  setUrl(r.url);
                  setHeaders(r.headers);
                  setBody(r.body);
                  setSavedId(r.id);
                  setResult(null);
                  setFailure(null);
                }}
                className="flex min-w-0 flex-1 flex-col items-start px-2.5 py-1.5 text-left"
              >
                <span className="w-full truncate text-xs text-fg">{r.name}</span>
                <span className="flex w-full items-center gap-1.5">
                  <MethodTag method={r.method} className="w-auto text-[10px]" />
                  <span className="truncate font-mono text-[10px] text-faint">{r.url}</span>
                </span>
              </button>
              <IconButton
                icon={Trash2}
                label="Delete saved request"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => {
                  removeRequest(r.id);
                  if (savedId === r.id) setSavedId(undefined);
                }}
              />
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="flex flex-col gap-3 p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Select value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)} aria-label="HTTP method" className="w-28 font-mono text-xs">
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              mono
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (!/^\s*(\$\s+)?curl(\.exe)?\s/i.test(text)) return;
                e.preventDefault();
                try {
                  const parsed = parseCurl(text);
                  setMethod(parsed.method);
                  setUrl(parsed.url);
                  setHeaders(parsed.headers);
                  setBody(parsed.bodyKind === 'multipart' ? parsed.form.map((f) => `${f.key}=${f.value}`).join('&') : parsed.body);
                  setSavedId(undefined);
                  toast(parsed.warnings.length ? `cURL imported with ${parsed.warnings.length} warning(s)` : 'cURL command imported', parsed.warnings.length ? 'info' : 'success');
                } catch (err) {
                  toast(`Could not parse cURL: ${err instanceof Error ? err.message : String(err)}`, 'error');
                }
              }}
              placeholder="/api/users  or  https://api.example.com/v1/users"
              aria-label="Request URL"
              className="h-9 flex-1"
            />
            {sending ? (
              <Button className="h-9" icon={Square} onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <Button type="submit" variant="primary" className="h-9" icon={Send} title={`Send (${modKey}+Enter)`}>
                Send
              </Button>
            )}
          </form>
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented
              size="sm"
              label="Request section"
              value={tab}
              options={[
                { value: 'headers', label: `Headers (${headers.filter((h) => h.enabled).length})` },
                { value: 'body', label: 'Body' },
              ]}
              onChange={setTab}
            />
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" icon={Bookmark} onClick={save}>
                {savedId ? 'Update saved' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copy(toCurl({ ...spec, url: absoluteUrl }), 'cURL command')}>
                Copy as cURL
              </Button>
              <Button size="sm" variant="ghost" icon={FileCode} onClick={() => void copy(toFetch({ ...spec, url: absoluteUrl }), 'fetch() snippet')}>
                Copy as fetch
              </Button>
              <Button size="sm" icon={Route} onClick={createMock}>
                {result ? 'Capture as mock' : 'Mock this endpoint'}
              </Button>
            </div>
          </div>
          {tab === 'headers' ? (
            <KeyValueEditor items={headers} onChange={setHeaders} />
          ) : (
            <div>
              {BODYLESS.has(method) && <p className="mb-1.5 text-[11px] text-warn">{method} requests cannot carry a body in browsers; it will not be sent.</p>}
              <CodeEditor label="Request body" value={body} onChange={setBody} minHeight={140} className="h-40" onSubmit={() => void send()} placeholder='{ "name": "value" }' />
            </div>
          )}
        </div>

        <div className="mx-4 mb-4 flex min-h-72 flex-1 flex-col rounded-lg border border-line bg-panel">
          {sending && !result && !failure ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Waiting for response
            </div>
          ) : failure && diagnosis ? (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-2">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">{diagnosis.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-faint">{failure.message}</p>
                </div>
              </div>
              <ul className="ml-6 list-disc space-y-1 text-xs text-muted">
                {diagnosis.causes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="ml-6 rounded-md border border-line bg-subtle p-3 text-xs">
                <p className="font-semibold text-fg">Offline alternatives</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-muted">
                  <li>Create a mock rule for this endpoint and design the response you expect; the runner will hit the mock instead.</li>
                  <li>Copy the request as cURL, run it in a terminal (no CORS there), then paste the JSON output into the rule body.</li>
                  <li>Paste a captured response into the Data Factory to infer a schema and generate realistic datasets.</li>
                </ol>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" icon={Route} onClick={createMock}>
                    Mock this endpoint
                  </Button>
                  <Button size="sm" icon={Copy} onClick={() => void copy(toCurl({ ...spec, url: absoluteUrl }), 'cURL command')}>
                    Copy as cURL
                  </Button>
                </div>
              </div>
            </div>
          ) : result && pretty ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <Badge tone={statusTone(result.status)}>
                  {result.status} {result.statusText}
                </Badge>
                <span className="font-mono text-[11px] text-muted">{result.durationMs} ms</span>
                <span className="font-mono text-[11px] text-muted">{formatBytes(result.size)}</span>
                {result.mocked ? <Badge tone="accent">served by mock</Badge> : <Badge>network</Badge>}
                <div className="ml-auto flex items-center gap-1">
                  <Segmented
                    size="sm"
                    label="Response section"
                    value={responseTab}
                    options={[
                      { value: 'body', label: 'Body' },
                      { value: 'headers', label: `Headers (${result.headers.length})` },
                    ]}
                    onChange={setResponseTab}
                  />
                  <IconButton icon={Copy} label="Copy response body" onClick={() => void copy(pretty.pretty, 'Response body')} />
                </div>
              </div>
              <div className="min-h-0 flex-1 p-3">
                {responseTab === 'body' ? (
                  <CodeEditor label="Response body" value={pretty.pretty} readOnly className="h-full min-h-60" />
                ) : (
                  <table className="w-full font-mono text-xs">
                    <tbody>
                      {result.headers.map(([k, v]) => (
                        <tr key={k} className="border-b border-line/60">
                          <td className="py-1 pr-4 align-top text-muted">{k}</td>
                          <td className="py-1 break-all text-fg">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <EmptyState icon={Send} title="Send a request to see the response">
              Relative URLs hit this origin, where your mock rules answer. Absolute URLs go to the network when no rule matches. Press {modKey}+Enter in the body editor to send.
            </EmptyState>
          )}
        </div>
      </div>
      <CurlImportModal />
    </div>
  );
}
