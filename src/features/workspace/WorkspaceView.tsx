import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Copy, Download, FileCode, FileJson, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { mergeWorkspace, parseWorkspace, serializeWorkspace, type MergeMode, type ParseWorkspaceResult } from '../../core/workspace/io.ts';
import { generateMswHandlers } from '../../core/codegen/msw.ts';
import { generateInterceptorSnippet } from '../../core/codegen/snippet.ts';
import { selectWorkspaceData, useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { Badge, Button, Field, Kbd, Section, Segmented, Select, Switch } from '../../components/ui.tsx';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { Modal } from '../../components/Modal.tsx';
import { copyText, cx, downloadText, formatBytes, isMac, modKey } from '../../lib/utils.ts';
import { exportWorkspaceFile } from '../../app/actions.ts';
import type { ThemeMode } from '../../core/types.ts';

type CodeTarget = 'msw' | 'snippet';

const SHORTCUTS: [string[], string][] = [
  [[modKey, 'K'], 'Open command palette'],
  [[isMac ? 'Opt' : 'Alt', '1-4'], 'Switch tool'],
  [[isMac ? 'Opt' : 'Alt', 'N'], 'New mock rule'],
  [[isMac ? 'Opt' : 'Alt', 'P'], 'Pause or resume interception'],
  [[modKey, 'Enter'], 'Send request from an editor'],
  [['Esc'], 'Close dialogs'],
];

export function WorkspaceView() {
  const state = useWorkspace();
  const toast = useUi((s) => s.toast);
  const data = useMemo(() => selectWorkspaceData(state), [state.rules, state.templates, state.requests, state.settings]);
  const [importText, setImportText] = useState('');
  const [mode, setMode] = useState<MergeMode>('merge');
  const [dragging, setDragging] = useState(false);
  const [codeTarget, setCodeTarget] = useState<CodeTarget>('msw');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportText = useMemo(() => serializeWorkspace(data), [data]);
  const parsed: ParseWorkspaceResult | null = useMemo(() => (importText.trim() ? parseWorkspace(importText) : null), [importText]);
  const code = useMemo(
    () => (codeTarget === 'msw' ? generateMswHandlers(state.rules, state.templates) : generateInterceptorSnippet(state.rules, state.templates)),
    [codeTarget, state.rules, state.templates],
  );

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('File is larger than 20 MB', 'error');
      return;
    }
    void file.text().then(setImportText);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    readFile(e.dataTransfer.files[0]);
  };

  const applyImport = () => {
    if (!parsed?.ok) return;
    const preview = mergeWorkspace(data, parsed.data, mode);
    state.importWorkspace(parsed.data, mode);
    setImportText('');
    toast(`Imported: ${preview.rules.length} rules, ${preview.templates.length} templates, ${preview.requests.length} requests`, 'success');
  };

  const copy = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast(ok ? `${label} copied` : 'Copy failed', ok ? 'success' : 'error');
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 xl:grid-cols-2">
        <Section
          title="Export workspace"
          actions={
            <>
              <Button size="sm" icon={Copy} onClick={() => void copy(exportText, 'Workspace JSON')}>
                Copy
              </Button>
              <Button size="sm" variant="primary" icon={Download} onClick={exportWorkspaceFile}>
                Download
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Mock rules" value={state.rules.length} />
            <Stat label="Data templates" value={state.templates.length} />
            <Stat label="Saved requests" value={state.requests.length} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            One portable JSON file ({formatBytes(new Blob([exportText]).size)}) containing every rule, template, saved request and setting. Commit it next to your
            frontend, attach it to a bug report, or hand it to QA. Nothing is uploaded.
          </p>
        </Section>

        <Section
          title="Import workspace"
          actions={
            <Button size="sm" icon={Upload} onClick={() => fileInput.current?.click()}>
              Choose file
            </Button>
          }
        >
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx('rounded-md transition-shadow', dragging && 'ring-2 ring-accent')}
          >
            <CodeEditor label="Workspace JSON to import" value={importText} onChange={setImportText} placeholder="Drop a workspace file here or paste its JSON" minHeight={120} className="h-32" />
          </div>
          {parsed && !parsed.ok && <p className="mt-2 text-xs text-bad">{parsed.error}</p>}
          {parsed?.ok && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge tone="ok">valid</Badge>
                <Badge>{parsed.data.rules.length} rules</Badge>
                <Badge>{parsed.data.templates.length} templates</Badge>
                <Badge>{parsed.data.requests.length} requests</Badge>
              </div>
              {parsed.warnings.map((w) => (
                <p key={w} className="text-[11px] text-warn">
                  {w}
                </p>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  size="sm"
                  label="Import mode"
                  value={mode}
                  options={[
                    { value: 'merge', label: 'Merge by id' },
                    { value: 'replace', label: 'Replace everything' },
                  ]}
                  onChange={setMode}
                />
                <Button size="sm" variant="primary" icon={FileJson} className="ml-auto" onClick={applyImport}>
                  Import
                </Button>
              </div>
            </div>
          )}
        </Section>

        <Section
          title="Code export"
          className="xl:col-span-2"
          actions={
            <>
              <Segmented
                size="sm"
                label="Code target"
                value={codeTarget}
                options={[
                  { value: 'msw', label: 'MSW handlers' },
                  { value: 'snippet', label: 'Drop-in script' },
                ]}
                onChange={setCodeTarget}
              />
              <Button size="sm" icon={Copy} onClick={() => void copy(code, 'Code')}>
                Copy
              </Button>
              <Button
                size="sm"
                icon={FileCode}
                onClick={() => downloadText(codeTarget === 'msw' ? 'handlers.js' : 'web-mock-studio.js', code, 'text/javascript')}
              >
                Download
              </Button>
            </>
          }
        >
          <p className="mb-2 text-xs leading-relaxed text-muted">
            {codeTarget === 'msw' ? (
              <>
                A Mock Service Worker v2 handlers module for unit tests, Storybook and local development. Datasets are snapshotted into the file, so it runs
                without this tool.
              </>
            ) : (
              <>
                A dependency-free script that patches fetch and XMLHttpRequest in any page. Load it before your app with a script tag, or paste it into the DevTools
                console of a running site to mock its API in place.
              </>
            )}
          </p>
          <CodeEditor label="Generated code" value={code} readOnly className="h-80" />
        </Section>

        <Section title="Preferences">
          <div className="flex flex-col gap-4">
            <Field label="Theme">
              <Select value={state.settings.theme} onChange={(e) => state.updateSettings({ theme: e.target.value as ThemeMode })} aria-label="Theme" className="w-48">
                <option value="system">Follow system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
            <ToggleRow
              title="Pass unmatched requests to the network"
              description="When off (strict mode), any fetch or XHR without a matching rule receives a 404, which surfaces endpoints you have not mocked yet."
              checked={state.settings.passthroughUnmatched}
              onChange={(v) => state.updateSettings({ passthroughUnmatched: v })}
            />
            <Field label="Traffic log size">
              <Select value={state.settings.logLimit} onChange={(e) => state.updateSettings({ logLimit: Number(e.target.value) })} aria-label="Traffic log size" className="w-48">
                {[100, 200, 500, 1000].map((n) => (
                  <option key={n} value={n}>
                    {n} entries
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                Reset workspace
              </Button>
            </div>
          </div>
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="Keyboard shortcuts">
            <ul className="flex flex-col gap-2 text-xs">
              {SHORTCUTS.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Privacy">
            <div className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden />
              <p>
                Web Mock Studio has no backend, no analytics and no telemetry. Workspace data lives in this browser's IndexedDB. Requests you send from the runner
                go directly from your browser to the target you choose.
              </p>
            </div>
          </Section>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset workspace"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                state.resetWorkspace(true);
                setConfirmReset(false);
                toast('Workspace cleared');
              }}
            >
              Clear everything
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                state.resetWorkspace(false);
                setConfirmReset(false);
                toast('Starter workspace restored');
              }}
            >
              Restore starter rules
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-muted">
          This removes every rule, template and saved request stored in this browser. Export the workspace first if you want to keep a copy.
        </p>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-subtle px-3 py-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
