import { Activity, Trash2 } from 'lucide-react';
import { useTraffic, type TrafficOutcome } from '../../store/traffic.ts';
import { useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { Badge, IconButton, MethodTag, statusTone } from '../../components/ui.tsx';
import { cx } from '../../lib/utils.ts';

const OUTCOME: Record<TrafficOutcome, { label: string; tone: 'accent' | 'warn' | 'bad' | 'neutral' }> = {
  mocked: { label: 'mocked', tone: 'accent' },
  injected: { label: 'injected', tone: 'warn' },
  'network-error': { label: 'offline', tone: 'bad' },
  passthrough: { label: 'network', tone: 'neutral' },
  pending: { label: 'pending', tone: 'neutral' },
};

function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.origin === location.origin ? `${url.pathname}${url.search}` : raw;
  } catch {
    return raw;
  }
}

export function TrafficPanel({ className }: { className?: string }) {
  const entries = useTraffic((s) => s.entries);
  const clear = useTraffic((s) => s.clear);
  const rules = useWorkspace((s) => s.rules);
  const selectRule = useUi((s) => s.selectRule);

  return (
    <section className={cx('flex min-h-0 flex-col border-t border-line bg-panel', className)} aria-label="Traffic log">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Activity size={13} className="text-muted" aria-hidden />
        <h3 className="text-xs font-semibold">Traffic</h3>
        <span className="text-[11px] text-faint">{entries.length} requests this session</span>
        <IconButton icon={Trash2} label="Clear traffic log" className="ml-auto" onClick={clear} disabled={entries.length === 0} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            Requests from this page appear here. Use the Request Runner, or call fetch() from the browser console.
          </p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {entries.map((e) => {
                const rule = e.ruleId ? rules.find((r) => r.id === e.ruleId) : undefined;
                const outcome = OUTCOME[e.outcome];
                return (
                  <tr key={e.id} className="border-b border-line/60 hover:bg-hover">
                    <td className="w-20 py-1.5 pl-3 font-mono text-[11px] text-faint tabular-nums">{new Date(e.time).toLocaleTimeString([], { hour12: false })}</td>
                    <td className="w-14 py-1.5">
                      <MethodTag method={e.method} />
                    </td>
                    <td className="max-w-0 py-1.5 pr-2">
                      <span className="block truncate font-mono text-[11px]" title={e.url}>
                        {displayUrl(e.url)}
                      </span>
                    </td>
                    <td className="w-16 py-1.5">
                      {e.status !== null && <Badge tone={statusTone(e.status)}>{e.status === 0 ? 'ERR' : e.status}</Badge>}
                    </td>
                    <td className="w-20 py-1.5">
                      <Badge tone={outcome.tone}>{outcome.label}</Badge>
                    </td>
                    <td className="w-16 py-1.5 text-right font-mono text-[11px] text-faint tabular-nums">{e.durationMs !== null ? `${e.durationMs} ms` : ''}</td>
                    <td className="w-40 py-1.5 pr-3 pl-3">
                      {rule && (
                        <button type="button" onClick={() => selectRule(rule.id)} className="block max-w-36 truncate text-[11px] text-accent hover:underline" title={rule.name}>
                          {rule.name}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
