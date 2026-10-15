import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, Dices, Download, FilePlus2, Route, Save, Trash2, Wand2 } from 'lucide-react';
import { inferSchema, parseJson } from '../../core/schema/infer.ts';
import { generateRecords } from '../../core/schema/generate.ts';
import { listFields, pathToString, updateField } from '../../core/schema/fields.ts';
import type { JsonSchema } from '../../core/schema/types.ts';
import { FAKER_CATALOG, FAKER_KINDS, type FakerCategory, type FakerKind } from '../../core/faker/kinds.ts';
import { createId } from '../../core/defaults.ts';
import type { DataTemplate } from '../../core/types.ts';
import { useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { Badge, Button, IconButton, Input, Segmented, Select } from '../../components/ui.tsx';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { copyText, cx, downloadText, formatBytes, slugify } from '../../lib/utils.ts';
import { createAndSelectRule } from '../../app/actions.ts';

const EXAMPLE_SAMPLE = `{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@analytical.dev",
  "avatar": "https://example.com/ada.png",
  "phone": "+1-202-555-0143",
  "address": {
    "street": "12 Marylebone Road",
    "city": "London",
    "country": "United Kingdom",
    "zipCode": "NW1 5LR"
  },
  "plan": "pro",
  "balance": 1520.75,
  "tags": ["math", "engines"],
  "lastLoginAt": "2026-03-14T09:26:53Z",
  "verified": true
}`;

const COUNTS = [
  { value: '10', label: '10' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
] as const;

const KIND_GROUPS = FAKER_KINDS.reduce<Record<FakerCategory, FakerKind[]>>(
  (acc, kind) => {
    acc[FAKER_CATALOG[kind].category].push(kind);
    return acc;
  },
  { Identity: [], Person: [], Location: [], Internet: [], Commerce: [], Time: [], Text: [], Number: [] },
);

type Overrides = Record<string, FakerKind>;

function applyOverrides(schema: JsonSchema, overrides: Overrides): JsonSchema {
  let next = schema;
  for (const field of listFields(schema)) {
    const kind = overrides[pathToString(field.path)];
    if (kind) next = updateField(next, field.path, (n) => ({ ...n, 'x-faker': kind }));
  }
  return next;
}

export function FactoryView() {
  const templates = useWorkspace((s) => s.templates);
  const saveTemplate = useWorkspace((s) => s.saveTemplate);
  const removeTemplate = useWorkspace((s) => s.removeTemplate);
  const selectedId = useUi((s) => s.selectedTemplateId);
  const selectTemplate = useUi((s) => s.selectTemplate);
  const toast = useUi((s) => s.toast);

  const existing = templates.find((t) => t.id === selectedId);
  const [draftId, setDraftId] = useState<string>(() => existing?.id ?? createId('tpl'));
  const [name, setName] = useState(existing?.name ?? 'Customer');
  const [sample, setSample] = useState(existing?.sample ?? EXAMPLE_SAMPLE);
  const [schema, setSchema] = useState<JsonSchema>(() => existing?.schema ?? inferSchema(JSON.parse(EXAMPLE_SAMPLE), 'Customer'));
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(schema, null, 2));
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [manualSchema, setManualSchema] = useState(!!existing);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [schemaTab, setSchemaTab] = useState<'fields' | 'json'>('fields');
  const [count, setCount] = useState(10);
  const [seed, setSeed] = useState('demo');
  const loadedFor = useRef<string | null>(existing?.id ?? null);

  useEffect(() => {
    if (!selectedId || selectedId === loadedFor.current) return;
    const t = templates.find((x) => x.id === selectedId);
    if (!t) return;
    loadedFor.current = t.id;
    setDraftId(t.id);
    setName(t.name);
    setSample(t.sample);
    setSchema(t.schema);
    setSchemaText(JSON.stringify(t.schema, null, 2));
    setSchemaError(null);
    setManualSchema(true);
    setOverrides({});
  }, [selectedId, templates]);

  const parsedSample = useMemo(() => parseJson(sample), [sample]);

  useEffect(() => {
    if (manualSchema || !parsedSample.ok) return;
    const timer = setTimeout(() => {
      const next = applyOverrides(inferSchema(parsedSample.value, name || undefined), overrides);
      setSchema(next);
      setSchemaText(JSON.stringify(next, null, 2));
      setSchemaError(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [parsedSample, manualSchema, overrides, name]);

  const output = useMemo(() => {
    try {
      const records = generateRecords(schema, count, { seed });
      return { text: JSON.stringify(records, null, 2), error: null };
    } catch (err) {
      return { text: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [schema, count, seed]);

  const fields = useMemo(() => listFields(schema), [schema]);
  const isSaved = templates.some((t) => t.id === draftId);

  const setFieldKind = (path: (string | '[]')[], kind: FakerKind | '') => {
    const key = pathToString(path);
    const next = updateField(schema, path, (n) => {
      const copy = { ...n };
      if (kind) copy['x-faker'] = kind;
      else delete copy['x-faker'];
      return copy;
    });
    setSchema(next);
    setSchemaText(JSON.stringify(next, null, 2));
    setOverrides((o) => {
      const copy = { ...o };
      if (kind) copy[key] = kind;
      else delete copy[key];
      return copy;
    });
  };

  const onSchemaText = (text: string) => {
    setSchemaText(text);
    const parsed = parseJson(text);
    if (parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) {
      setSchema(parsed.value as JsonSchema);
      setSchemaError(null);
      setManualSchema(true);
    } else {
      setSchemaError(parsed.ok ? 'Schema must be a JSON object' : (parsed.error ?? 'Invalid JSON'));
    }
  };

  const reinfer = () => {
    if (!parsedSample.ok) {
      toast('Fix the sample JSON first', 'error');
      return;
    }
    const next = applyOverrides(inferSchema(parsedSample.value, name || undefined), overrides);
    setSchema(next);
    setSchemaText(JSON.stringify(next, null, 2));
    setSchemaError(null);
    setManualSchema(false);
  };

  const persist = (): DataTemplate => {
    const now = Date.now();
    const prior = templates.find((t) => t.id === draftId);
    const template: DataTemplate = { id: draftId, name: name.trim() || 'Untitled', sample, schema, createdAt: prior?.createdAt ?? now, updatedAt: now };
    saveTemplate(template);
    loadedFor.current = draftId;
    selectTemplate(draftId);
    return template;
  };

  const newDraft = () => {
    const id = createId('tpl');
    loadedFor.current = id;
    selectTemplate(null);
    setDraftId(id);
    setName('Untitled');
    setSample('{\n  \n}');
    setManualSchema(false);
    setOverrides({});
  };

  const createRule = () => {
    const template = persist();
    const resource = slugify(template.name) || 'items';
    createAndSelectRule({
      name: `List ${template.name}`,
      pattern: `/api/${resource.endsWith('s') ? resource : `${resource}s`}`,
      response: {
        status: 200,
        headers: [],
        bodyMode: 'dataset',
        body: '',
        dataset: { templateId: template.id, count: 50, envelope: 'paginated' },
      },
    });
    toast(`Template saved and bound to a new paginated rule`, 'success');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2.5">
        <Select
          value={isSaved ? draftId : ''}
          onChange={(e) => (e.target.value ? selectTemplate(e.target.value) : newDraft())}
          aria-label="Template"
          className="w-48"
        >
          <option value="">{isSaved ? 'New draft' : 'Unsaved draft'}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" placeholder="Template name" className="w-48" />
        <Button icon={Save} onClick={() => (persist(), toast('Template saved', 'success'))}>
          {isSaved ? 'Save' : 'Save template'}
        </Button>
        <Button variant="primary" icon={Route} onClick={createRule}>
          Create mock endpoint
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <IconButton icon={FilePlus2} label="New draft" onClick={newDraft} />
          {isSaved && (
            <IconButton
              icon={Trash2}
              label="Delete template"
              className="hover:text-bad"
              onClick={() => {
                removeTemplate(draftId);
                toast(`Deleted template "${name}"`);
                newDraft();
              }}
            />
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-line lg:grid-cols-3 lg:overflow-hidden">
        <Pane
          title="1. Sample JSON"
          status={parsedSample.ok ? <Badge tone="ok">valid</Badge> : <Badge tone="bad">invalid</Badge>}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setSample(EXAMPLE_SAMPLE)}>
              Example
            </Button>
          }
        >
          <CodeEditor label="Sample JSON" value={sample} onChange={setSample} className="h-full" invalid={!parsedSample.ok} placeholder="Paste a JSON object or array returned by your API" />
          {!parsedSample.ok && <p className="mt-1.5 truncate text-[11px] text-bad">{parsedSample.error}</p>}
        </Pane>

        <Pane
          title="2. Inferred schema"
          status={manualSchema ? <Badge tone="warn">edited</Badge> : <Badge tone="accent">auto</Badge>}
          actions={
            <>
              <Segmented
                size="sm"
                label="Schema view"
                value={schemaTab}
                options={[
                  { value: 'fields', label: 'Fields' },
                  { value: 'json', label: 'JSON Schema' },
                ]}
                onChange={setSchemaTab}
              />
              <IconButton icon={Wand2} label="Re-infer from sample" onClick={reinfer} />
            </>
          }
        >
          {schemaTab === 'json' ? (
            <>
              <CodeEditor label="JSON Schema" value={schemaText} onChange={onSchemaText} className="h-full" invalid={!!schemaError} />
              {schemaError && <p className="mt-1.5 truncate text-[11px] text-bad">{schemaError}</p>}
            </>
          ) : (
            <div className="h-full overflow-auto rounded-md border border-line">
              {fields.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted">The schema has no object fields. Edit it in the JSON Schema view.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-subtle text-[10px] tracking-wider text-faint uppercase">
                    <tr>
                      <th className="px-2.5 py-1.5 text-left font-medium">Field</th>
                      <th className="px-2 py-1.5 text-left font-medium">Type</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Generator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const key = pathToString(f.path);
                      const container = f.type === 'object' || f.type.startsWith('array') || f.type === 'object?';
                      return (
                        <tr key={key} className="border-t border-line/70">
                          <td className="px-2.5 py-1 font-mono" style={{ paddingLeft: 10 + f.depth * 14 }}>
                            {f.label}
                          </td>
                          <td className="px-2 py-1 text-muted">{f.type}</td>
                          <td className="px-2.5 py-1">
                            {container ? (
                              <span className="text-faint">nested</span>
                            ) : f.schema.enum ? (
                              <span className="block max-w-44 truncate font-mono text-[11px] text-muted" title={f.schema.enum.map(String).join(', ')}>
                                one of {f.schema.enum.length}
                              </span>
                            ) : (
                              <select
                                value={f.schema['x-faker'] ?? ''}
                                onChange={(e) => setFieldKind(f.path, e.target.value as FakerKind | '')}
                                aria-label={`Generator for ${key}`}
                                className={cx('h-6 w-full max-w-44 rounded border border-line bg-panel px-1 text-[11px]', overrides[key] && 'border-accent text-accent')}
                              >
                                <option value="">By type</option>
                                {(Object.keys(KIND_GROUPS) as FakerCategory[]).map((group) => (
                                  <optgroup key={group} label={group}>
                                    {KIND_GROUPS[group].map((k) => (
                                      <option key={k} value={k}>
                                        {FAKER_CATALOG[k].label}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Pane>

        <Pane
          title="3. Generated data"
          status={<span className="font-mono text-[11px] text-faint">{formatBytes(new Blob([output.text]).size)}</span>}
          actions={
            <>
              <Segmented size="sm" label="Record count" value={String(count) as '10' | '50' | '100'} options={COUNTS} onChange={(v) => setCount(Number(v))} />
              <IconButton icon={Dices} label="New random seed" onClick={() => setSeed(Math.random().toString(36).slice(2, 8))} />
              <IconButton icon={Copy} label="Copy JSON" onClick={() => void copyText(output.text).then((ok) => toast(ok ? `Copied ${count} records` : 'Copy failed', ok ? 'success' : 'error'))} />
              <IconButton icon={Download} label="Download JSON" onClick={() => downloadText(`${slugify(name) || 'data'}-${count}.json`, output.text)} />
            </>
          }
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-muted">Seed</span>
            <Input mono value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" className="h-7 w-32" />
            <span className="text-[11px] text-faint">Same seed, same data.</span>
          </div>
          {output.error ? <p className="text-xs text-bad">{output.error}</p> : <CodeEditor label="Generated data" value={output.text} readOnly className="h-[calc(100%-36px)]" />}
        </Pane>
      </div>
    </div>
  );
}

function Pane({ title, status, actions, children }: { title: string; status?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-[420px] min-w-0 flex-col bg-canvas lg:min-h-0">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <h3 className="text-xs font-semibold">{title}</h3>
        {status}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}
