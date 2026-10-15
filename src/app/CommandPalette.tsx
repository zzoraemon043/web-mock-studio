import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Braces,
  CornerDownLeft,
  Database,
  Download,
  FileCode,
  FolderCog,
  Monitor,
  Moon,
  Plus,
  Power,
  Route,
  Search,
  Send,
  Sun,
  TerminalSquare,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useUi, type ToolId } from '../store/ui.ts';
import { useWorkspace } from '../store/workspace.ts';
import { useTraffic } from '../store/traffic.ts';
import { cx, fuzzyScore, isMac } from '../lib/utils.ts';
import { Kbd } from '../components/ui.tsx';
import { createAndSelectRule, exportWorkspaceFile, toggleInterception } from './actions.ts';

interface Command {
  id: string;
  title: string;
  group: string;
  icon: LucideIcon;
  hint?: string;
  keywords?: string;
  shortcut?: string[];
  run: () => void;
}

const alt = isMac ? 'Opt' : 'Alt';

const TOOL_COMMANDS: { tool: ToolId; title: string; icon: LucideIcon; key: string }[] = [
  { tool: 'mocks', title: 'Go to Mock Rules', icon: Route, key: '1' },
  { tool: 'factory', title: 'Go to Data Factory', icon: Database, key: '2' },
  { tool: 'runner', title: 'Go to Request Runner', icon: Send, key: '3' },
  { tool: 'workspace', title: 'Go to Workspace', icon: FolderCog, key: '4' },
];

function useCommands(): Command[] {
  const rules = useWorkspace((s) => s.rules);
  const templates = useWorkspace((s) => s.templates);
  const requests = useWorkspace((s) => s.requests);
  const interception = useWorkspace((s) => s.settings.interceptionEnabled);

  return useMemo(() => {
    const ui = useUi.getState();
    const ws = useWorkspace.getState();
    const commands: Command[] = [
      ...TOOL_COMMANDS.map((t) => ({
        id: `tool:${t.tool}`,
        title: t.title,
        group: 'Navigation',
        icon: t.icon,
        shortcut: [alt, t.key],
        run: () => ui.setTool(t.tool),
      })),
      { id: 'rule:new', title: 'New mock rule', group: 'Actions', icon: Plus, shortcut: [alt, 'N'], run: () => createAndSelectRule() },
      { id: 'curl:import', title: 'Import cURL command', group: 'Actions', icon: TerminalSquare, keywords: 'paste parse', run: () => ui.setCurlImportOpen(true) },
      {
        id: 'interception',
        title: interception ? 'Pause interception' : 'Resume interception',
        group: 'Actions',
        icon: Power,
        keywords: 'toggle enable disable mock',
        shortcut: [alt, 'P'],
        run: toggleInterception,
      },
      { id: 'export', title: 'Export workspace as JSON', group: 'Actions', icon: Download, keywords: 'backup save share', run: exportWorkspaceFile },
      { id: 'codegen', title: 'Export MSW handlers or interceptor script', group: 'Actions', icon: FileCode, keywords: 'code snippet generate', run: () => ui.setTool('workspace') },
      { id: 'traffic:clear', title: 'Clear traffic log', group: 'Actions', icon: Trash2, run: () => useTraffic.getState().clear() },
      { id: 'theme:light', title: 'Theme: Light', group: 'Appearance', icon: Sun, run: () => ws.updateSettings({ theme: 'light' }) },
      { id: 'theme:dark', title: 'Theme: Dark', group: 'Appearance', icon: Moon, run: () => ws.updateSettings({ theme: 'dark' }) },
      { id: 'theme:system', title: 'Theme: Follow system', group: 'Appearance', icon: Monitor, run: () => ws.updateSettings({ theme: 'system' }) },
      ...rules.map((r) => ({
        id: `rule:${r.id}`,
        title: r.name,
        hint: `${r.method} ${r.pattern}`,
        group: 'Mock rules',
        icon: Route,
        keywords: `${r.method} ${r.pattern}`,
        run: () => {
          ui.selectRule(r.id);
          ui.setTool('mocks');
        },
      })),
      ...templates.map((t) => ({
        id: `tpl:${t.id}`,
        title: t.name,
        hint: 'Data template',
        group: 'Data templates',
        icon: Braces,
        run: () => {
          ui.selectTemplate(t.id);
          ui.setTool('factory');
        },
      })),
      ...requests.map((r) => ({
        id: `req:${r.id}`,
        title: r.name,
        hint: `${r.method} ${r.url}`,
        group: 'Saved requests',
        icon: Send,
        keywords: r.url,
        run: () => ui.openInRunner({ method: r.method, url: r.url, headers: r.headers, body: r.body, savedId: r.id }),
      })),
    ];
    return commands;
  }, [rules, templates, requests, interception]);
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const ranked = !query.trim()
      ? commands.slice(0, 60)
      : commands
          .map((c) => ({ c, score: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, c.keywords ?? '') - 50, fuzzyScore(query, c.group) - 200) }))
          .filter((r) => r.score >= 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 50)
          .map((r) => r.c);
    // Groups are ordered by their best-ranked member and rendered once each, so the
    // flat index used for keyboard navigation matches the visual order.
    const groups = new Map<string, Command[]>();
    for (const c of ranked) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
    return [...groups].map(([group, items]) => ({ group, items }));
  }, [commands, query]);

  const results = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="wms-enter flex max-h-[65vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Search size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Search commands, rules, templates, requests"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="wms-palette-list"
            aria-activedescendant={results[active] ? `wms-cmd-${active}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={list} id="wms-palette-list" role="listbox" className="min-h-0 flex-1 overflow-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted">No matching commands</p>}
          {grouped.map((g) => (
            <div key={g.group} className="mb-1">
              <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">{g.group}</p>
              {g.items.map((command) => {
                const index = results.indexOf(command);
                return <PaletteItem key={command.id} command={command} index={index} active={index === active} onHover={() => setActive(index)} onRun={() => run(command)} />;
              })}
            </div>
          ))}
        </div>
        <footer className="flex items-center gap-3 border-t border-line bg-subtle px-3.5 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1">
            <Kbd>Up</Kbd>
            <Kbd>Down</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft size={10} />
            </Kbd>
            run
          </span>
        </footer>
      </div>
    </div>
  );
}

function PaletteItem({ command, index, active, onHover, onRun }: { command: Command; index: number; active: boolean; onHover: () => void; onRun: () => void }): ReactNode {
  const Icon = command.icon;
  return (
    <div
      id={`wms-cmd-${index}`}
      role="option"
      aria-selected={active}
      data-index={index}
      onMouseMove={onHover}
      onClick={onRun}
      className={cx('flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2', active ? 'bg-accent-soft text-fg' : 'text-fg')}
    >
      <Icon size={15} className={active ? 'text-accent' : 'text-muted'} aria-hidden />
      <span className="truncate text-[13px]">{command.title}</span>
      {command.hint && <span className="min-w-0 truncate font-mono text-[11px] text-faint">{command.hint}</span>}
      <span className="ml-auto flex shrink-0 gap-1">
        {command.shortcut?.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}
