import { useEffect } from 'react';
import { Database, FolderCog, Monitor, Moon, Route, Search, Send, Sun, type LucideIcon } from 'lucide-react';
import { CommandPalette } from './CommandPalette.tsx';
import { useHotkeys } from './useHotkeys.ts';
import { NEXT_THEME, useThemeSync } from './theme.ts';
import { Toaster } from '../components/Toaster.tsx';
import { Kbd, Switch } from '../components/ui.tsx';
import { MocksView } from '../features/mocks/MocksView.tsx';
import { FactoryView } from '../features/factory/FactoryView.tsx';
import { RunnerView } from '../features/runner/RunnerView.tsx';
import { WorkspaceView } from '../features/workspace/WorkspaceView.tsx';
import { startEngine } from '../runtime/engine.ts';
import { useTraffic, type EngineMode } from '../store/traffic.ts';
import { useUi, type ToolId } from '../store/ui.ts';
import { useWorkspace } from '../store/workspace.ts';
import { cx, isMac, modKey } from '../lib/utils.ts';

const NAV: { id: ToolId; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'mocks', label: 'Mock Rules', description: 'Intercept routes, shape responses, simulate network conditions', icon: Route },
  { id: 'factory', label: 'Data Factory', description: 'Infer JSON Schema from samples and generate realistic datasets', icon: Database },
  { id: 'runner', label: 'Request Runner', description: 'Import cURL, send requests, capture responses as mocks', icon: Send },
  { id: 'workspace', label: 'Workspace', description: 'Import, export, code generation and preferences', icon: FolderCog },
];

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

const ENGINE_LABEL: Record<EngineMode, { label: string; tone: string }> = {
  starting: { label: 'Starting', tone: 'bg-faint' },
  'service-worker': { label: 'Service Worker', tone: 'bg-ok' },
  'page-patch': { label: 'In-page fetch', tone: 'bg-warn' },
  unsupported: { label: 'Unavailable', tone: 'bg-bad' },
};

export function App() {
  useThemeSync();
  useHotkeys();

  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const theme = useWorkspace((s) => s.settings.theme);
  const interception = useWorkspace((s) => s.settings.interceptionEnabled);
  const updateSettings = useWorkspace((s) => s.updateSettings);
  const mode = useTraffic((s) => s.mode);
  const modeDetail = useTraffic((s) => s.detail);

  useEffect(() => {
    void startEngine();
  }, []);

  const current = NAV.find((n) => n.id === tool) ?? NAV[0];
  const ThemeIcon = THEME_ICONS[theme];
  const engine = ENGINE_LABEL[mode];
  const altKey = isMac ? 'Opt' : 'Alt';

  return (
    <div className="flex h-full min-h-0 bg-canvas text-fg">
      <nav aria-label="Tools" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3 lg:w-52 lg:items-stretch lg:px-2.5">
        <div className="mb-4 flex items-center gap-2 px-1 lg:px-1.5">
          <Logo />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-[13px] leading-tight font-semibold">Web Mock Studio</p>
            <p className="truncate text-[10px] leading-tight text-faint">Offline API workbench</p>
          </div>
        </div>
        {NAV.map((item, i) => {
          const Icon = item.icon;
          const active = item.id === tool;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTool(item.id)}
              aria-current={active ? 'page' : undefined}
              title={`${item.label} (${altKey}+${i + 1})`}
              className={cx(
                'group flex h-9 items-center justify-center gap-2.5 rounded-md text-[13px] font-medium transition-colors lg:justify-start lg:px-2.5',
                active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
              )}
            >
              <Icon size={16} aria-hidden />
              <span className="hidden flex-1 text-left lg:inline">{item.label}</span>
              <span className="hidden font-mono text-[10px] text-faint lg:inline">{`${altKey}+${i + 1}`}</span>
            </button>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 lg:items-stretch">
          <div className="hidden rounded-md border border-line bg-subtle p-2.5 text-[11px] lg:block" title={modeDetail}>
            <div className="flex items-center gap-1.5 font-medium text-fg">
              <span className={cx('h-1.5 w-1.5 rounded-full', engine.tone)} />
              {engine.label}
            </div>
            <p className="mt-1 leading-snug text-faint">All data stays in this browser.</p>
          </div>
          <span className={cx('h-2 w-2 rounded-full lg:hidden', engine.tone)} title={`${engine.label}: ${modeDetail}`} />
          <button
            type="button"
            onClick={() => updateSettings({ theme: NEXT_THEME[theme] })}
            title={`Theme: ${theme} (click to change)`}
            aria-label={`Theme: ${theme}`}
            className="flex h-8 items-center justify-center gap-2 rounded-md text-xs text-muted hover:bg-hover hover:text-fg lg:justify-start lg:px-2.5"
          >
            <ThemeIcon size={15} aria-hidden />
            <span className="hidden lg:inline">{theme === 'system' ? 'Theme: System' : theme === 'dark' ? 'Theme: Dark' : 'Theme: Light'}</span>
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{current?.label}</h1>
          </div>
          <p className="hidden min-w-0 truncate text-xs text-faint xl:block">{current?.description}</p>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-subtle px-2.5 text-xs text-faint hover:border-line-strong md:flex"
            >
              <Search size={13} aria-hidden />
              <span className="flex-1 truncate text-left whitespace-nowrap">Search or run command</span>
              <Kbd>{modKey}</Kbd>
              <Kbd>K</Kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" className="text-muted md:hidden">
              <Search size={16} />
            </button>
            <div className="flex items-center gap-2" title={`${altKey}+P`}>
              <span className={cx('text-xs font-medium', interception ? 'text-fg' : 'text-faint')}>{interception ? 'Intercepting' : 'Paused'}</span>
              <Switch checked={interception} onChange={(v) => updateSettings({ interceptionEnabled: v })} label="Toggle request interception" />
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          {tool === 'mocks' && <MocksView />}
          {tool === 'factory' && <FactoryView />}
          {tool === 'runner' && <RunnerView />}
          {tool === 'workspace' && <WorkspaceView />}
        </main>
      </div>
      <CommandPalette />
      <Toaster />
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--wms-accent)" />
      <path d="M8 11l4 10 4-7 4 7 4-10" fill="none" stroke="var(--wms-accent-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
