import { useMemo } from 'react';
import { ArrowUpRight, Copy, Plus, Trash2, Wand2, X } from 'lucide-react';
import { HTTP_METHODS, type FailureOutcome, type LatencyProfile, type MockRule, type QueryMatchMode, type RuleMethod } from '../../core/types.ts';
import { describePattern } from '../../core/router/match.ts';
import { COMMON_STATUSES, FAILURE_OUTCOMES, LATENCY_PROFILES, MAX_DELAY_MS, statusText } from '../../core/mock/network.ts';
import { TEMPLATE_TOKENS } from '../../core/mock/template.ts';
import { useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { Badge, Button, Field, IconButton, Input, Section, Segmented, Select } from '../../components/ui.tsx';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { KeyValueEditor } from '../../components/KeyValueEditor.tsx';
import { cx, formatJson } from '../../lib/utils.ts';
import { sampleUrlForPattern } from '../../app/actions.ts';

const LATENCY_OPTIONS = (Object.keys(LATENCY_PROFILES) as LatencyProfile[]).map((value) => ({ value, label: LATENCY_PROFILES[value].label }));

const QUERY_MODES: { value: QueryMatchMode; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'present', label: 'is present' },
  { value: 'absent', label: 'is absent' },
  { value: 'regex', label: 'matches regex' },
];

const ENVELOPES = [
  { value: 'array', label: 'Array' },
  { value: 'paginated', label: 'Paginated' },
  { value: 'item', label: 'Single item' },
] as const;

const ENVELOPE_HINTS = {
  array: 'Returns every generated record as a JSON array.',
  paginated: 'Returns { data, page, pageSize, total, totalPages } and honors ?page= with ?pageSize=, ?per_page= or ?limit=.',
  item: 'Returns the record whose id equals the first path parameter, falling back to its 1-based position; 404 when not found.',
} as const;

export function RuleEditor({ rule }: { rule: MockRule }) {
  const updateRule = useWorkspace((s) => s.updateRule);
  const duplicateRule = useWorkspace((s) => s.duplicateRule);
  const removeRule = useWorkspace((s) => s.removeRule);
  const templates = useWorkspace((s) => s.templates);
  const selectRule = useUi((s) => s.selectRule);
  const openInRunner = useUi((s) => s.openInRunner);
  const toast = useUi((s) => s.toast);

  const patch = (p: Partial<MockRule>) => updateRule(rule.id, p);
  const patchResponse = (p: Partial<MockRule['response']>) => updateRule(rule.id, (r) => ({ ...r, response: { ...r.response, ...p } }));
  const patchNetwork = (p: Partial<MockRule['network']>) => updateRule(rule.id, (r) => ({ ...r, network: { ...r.network, ...p } }));

  const pattern = useMemo(() => describePattern(rule.pattern), [rule.pattern]);
  const bodyIsJson = useMemo(() => {
    const t = rule.response.body.trim();
    if (!t || !/^[[{]/.test(t)) return null;
    return formatJson(t.replace(/\{\{[^}]+\}\}/g, '0')) !== null;
  }, [rule.response.body]);

  const toggleFailure = (value: FailureOutcome) => {
    const list = rule.network.failureOutcomes;
    patchNetwork({ failureOutcomes: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };

  const testInRunner = () => {
    const method = rule.method === 'ANY' ? 'GET' : rule.method;
    const hasBody = !['GET', 'HEAD'].includes(method);
    openInRunner({
      method,
      url: sampleUrlForPattern(rule.pattern),
      headers: hasBody ? [{ key: 'Content-Type', value: 'application/json', enabled: true }] : [],
      body: hasBody ? '{}' : '',
    });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={rule.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Rule name" className="h-9 max-w-md flex-1 text-sm font-semibold" />
        <div className="ml-auto flex items-center gap-1.5">
          <Button icon={ArrowUpRight} onClick={testInRunner}>
            Test in Runner
          </Button>
          <IconButton
            icon={Copy}
            label="Duplicate rule"
            onClick={() => {
              const copy = duplicateRule(rule.id);
              if (copy) selectRule(copy.id);
            }}
          />
          <IconButton
            icon={Trash2}
            label="Delete rule"
            className="hover:text-bad"
            onClick={() => {
              removeRule(rule.id);
              selectRule(null);
              toast(`Deleted "${rule.name}"`);
            }}
          />
        </div>
      </div>

      <Section title="Request matching">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Select value={rule.method} onChange={(e) => patch({ method: e.target.value as RuleMethod })} aria-label="HTTP method" className="w-28 font-mono text-xs">
              {[...HTTP_METHODS, 'ANY'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              mono
              value={rule.pattern}
              onChange={(e) => patch({ pattern: e.target.value })}
              placeholder="/api/users/:id  or  https://api.example.com/v1/*"
              aria-label="URL pattern"
              invalid={!!pattern.error || !rule.pattern}
              className="flex-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {pattern.error ? (
              <span className="text-bad">{pattern.error}</span>
            ) : (
              <>
                <span>Params:</span>
                {pattern.params.length === 0 ? <span className="text-faint">none</span> : pattern.params.map((p) => <Badge key={p} tone="accent">{p === '*' ? 'wildcard' : p}</Badge>)}
                <span className="ml-2 text-faint">Supports :param, :optional?, {'{param}'}, trailing *, absolute URLs and ?key=value.</span>
              </>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Query conditions</p>
            <div className="flex flex-col gap-1.5">
              {rule.query.map((q, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    mono
                    value={q.key}
                    placeholder="param"
                    aria-label="Query parameter"
                    onChange={(e) => patch({ query: rule.query.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}
                    className="flex-[2]"
                  />
                  <Select
                    value={q.mode}
                    aria-label="Match mode"
                    onChange={(e) => patch({ query: rule.query.map((x, j) => (j === i ? { ...x, mode: e.target.value as QueryMatchMode } : x)) })}
                    className="w-36"
                  >
                    {QUERY_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    mono
                    value={q.value}
                    placeholder={q.mode === 'regex' ? '^\\d+$' : 'value'}
                    aria-label="Expected value"
                    disabled={q.mode === 'present' || q.mode === 'absent'}
                    onChange={(e) => patch({ query: rule.query.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                    className="flex-[3]"
                  />
                  <IconButton icon={X} label="Remove condition" onClick={() => patch({ query: rule.query.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <div>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => patch({ query: [...rule.query, { key: '', value: '', mode: 'equals' }] })}>
                  Add condition
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Response"
        actions={
          <Segmented
            size="sm"
            label="Body source"
            value={rule.response.bodyMode}
            options={[
              { value: 'inline', label: 'Inline body' },
              { value: 'dataset', label: 'Dataset' },
            ]}
            onChange={(bodyMode) => patchResponse({ bodyMode })}
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Status">
              <div className="flex gap-1.5">
                <Input
                  mono
                  type="number"
                  min={200}
                  max={599}
                  value={rule.response.status}
                  onChange={(e) => patchResponse({ status: Math.min(599, Math.max(200, Number(e.target.value) || 200)) })}
                  aria-label="Status code"
                  className="w-20"
                  list="wms-statuses"
                />
                <span className="flex items-center truncate text-xs text-muted">{statusText(rule.response.status)}</span>
                <datalist id="wms-statuses">
                  {COMMON_STATUSES.filter((s) => s >= 200).map((s) => (
                    <option key={s} value={s}>
                      {statusText(s)}
                    </option>
                  ))}
                </datalist>
              </div>
            </Field>
            <Field label="Headers">
              <KeyValueEditor items={rule.response.headers} onChange={(headers) => patchResponse({ headers })} />
            </Field>
          </div>

          {rule.response.bodyMode === 'inline' ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Body</span>
                {bodyIsJson === true && <Badge tone="ok">valid JSON</Badge>}
                {bodyIsJson === false && <Badge tone="bad">invalid JSON</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Wand2}
                  className="ml-auto"
                  onClick={() => {
                    const formatted = formatJson(rule.response.body);
                    if (formatted) patchResponse({ body: formatted });
                    else toast('Body is not plain JSON (template tokens outside strings cannot be auto-formatted)', 'error');
                  }}
                >
                  Format
                </Button>
              </div>
              <CodeEditor label="Response body" value={rule.response.body} onChange={(body) => patchResponse({ body })} minHeight={200} className="h-64" invalid={bodyIsJson === false} />
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] text-faint">Insert token:</span>
                {TEMPLATE_TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => patchResponse({ body: `${rule.response.body}${t}` })}
                    className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-accent hover:text-accent"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Template">
                <Select
                  value={rule.response.dataset.templateId}
                  onChange={(e) => patchResponse({ dataset: { ...rule.response.dataset, templateId: e.target.value } })}
                  aria-label="Dataset template"
                >
                  <option value="">Select a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Records">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={rule.response.dataset.count}
                  onChange={(e) => patchResponse({ dataset: { ...rule.response.dataset, count: Math.min(10000, Math.max(0, Number(e.target.value) || 0)) } })}
                  aria-label="Record count"
                />
              </Field>
              <Field label="Envelope">
                <Segmented
                  label="Envelope"
                  value={rule.response.dataset.envelope}
                  options={ENVELOPES}
                  onChange={(envelope) => patchResponse({ dataset: { ...rule.response.dataset, envelope } })}
                />
              </Field>
              <p className="text-[11px] text-muted sm:col-span-3">
                {ENVELOPE_HINTS[rule.response.dataset.envelope]} Records are seeded from the template, so every request sees the same collection.
                {templates.length === 0 && ' Create a template in the Data Factory first.'}
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Network simulation">
        <div className="flex flex-col gap-4">
          <Field label="Latency">
            <Segmented label="Latency profile" value={rule.network.latency} options={LATENCY_OPTIONS} onChange={(latency) => patchNetwork({ latency })} />
          </Field>
          {rule.network.latency !== 'none' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Base delay (ms)" hint={rule.network.latency === 'custom' ? `Up to ${MAX_DELAY_MS / 1000}s` : 'Set by profile'}>
                <Input
                  type="number"
                  min={0}
                  max={MAX_DELAY_MS}
                  disabled={rule.network.latency !== 'custom'}
                  value={rule.network.latency === 'custom' ? rule.network.customDelayMs : LATENCY_PROFILES[rule.network.latency].baseMs}
                  onChange={(e) => patchNetwork({ customDelayMs: Math.min(MAX_DELAY_MS, Math.max(0, Number(e.target.value) || 0)) })}
                  aria-label="Base delay in milliseconds"
                />
              </Field>
              <Field label={`Jitter: +/- ${rule.network.jitterMs} ms`}>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={10}
                  value={rule.network.jitterMs}
                  onChange={(e) => patchNetwork({ jitterMs: Number(e.target.value) })}
                  className="h-8 accent-[var(--wms-accent)]"
                  aria-label="Jitter in milliseconds"
                />
              </Field>
            </div>
          )}
          <Field label={`Failure injection: ${rule.network.failureRate}% of requests`}>
            <input
              type="range"
              min={0}
              max={100}
              value={rule.network.failureRate}
              onChange={(e) => patchNetwork({ failureRate: Number(e.target.value) })}
              className="h-8 accent-[var(--wms-accent)]"
              aria-label="Failure rate percentage"
            />
          </Field>
          <div className={cx('flex flex-wrap gap-1.5', rule.network.failureRate === 0 && 'opacity-50')}>
            {FAILURE_OUTCOMES.map((o) => {
              const on = rule.network.failureOutcomes.includes(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFailure(o.value)}
                  className={cx(
                    'h-7 rounded-md border px-2.5 font-mono text-[11px] transition-colors',
                    on ? 'border-warn/60 bg-warn/10 text-warn' : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {rule.network.failureRate > 0 && rule.network.failureOutcomes.length === 0 && <p className="text-[11px] text-bad">Select at least one failure outcome.</p>}
        </div>
      </Section>
    </div>
  );
}
