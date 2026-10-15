import { useMemo, useState } from 'react';
import { Plus, Search, Shuffle, Timer, Database } from 'lucide-react';
import { useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { useTraffic } from '../../store/traffic.ts';
import { Button, Input, MethodTag, Switch } from '../../components/ui.tsx';
import { cx } from '../../lib/utils.ts';
import { createAndSelectRule } from '../../app/actions.ts';
import { LATENCY_PROFILES } from '../../core/mock/network.ts';

export function RuleList() {
  const rules = useWorkspace((s) => s.rules);
  const toggleRule = useWorkspace((s) => s.toggleRule);
  const selected = useUi((s) => s.selectedRuleId);
  const selectRule = useUi((s) => s.selectRule);
  const hits = useTraffic((s) => s.hits);
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => `${r.name} ${r.method} ${r.pattern}`.toLowerCase().includes(q));
  }, [rules, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line p-2.5">
        <div className="relative flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rules" aria-label="Filter rules" className="w-full pl-7" />
        </div>
        <Button variant="primary" icon={Plus} onClick={() => createAndSelectRule()} title="New rule (Alt+N)">
          New
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-1.5" aria-label="Mock rules">
        {visible.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted">{rules.length ? 'No rules match the filter.' : 'No rules yet.'}</li>}
        {visible.map((rule) => {
          const active = rule.id === selected;
          const latency = rule.network.latency !== 'none';
          return (
            <li key={rule.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => selectRule(rule.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectRule(rule.id);
                  }
                }}
                className={cx(
                  'group mb-0.5 flex cursor-pointer flex-col gap-1 rounded-md border px-2.5 py-2 transition-colors',
                  active ? 'border-accent/40 bg-accent-soft' : 'border-transparent hover:bg-hover',
                  !rule.enabled && 'opacity-55',
                )}
              >
                <div className="flex items-center gap-2">
                  <MethodTag method={rule.method} className="w-auto" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={rule.pattern}>
                    {rule.pattern || '(no pattern)'}
                  </span>
                  <Switch size="sm" checked={rule.enabled} onChange={() => toggleRule(rule.id)} label={rule.enabled ? 'Disable rule' : 'Enable rule'} />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="min-w-0 flex-1 truncate">{rule.name}</span>
                  {rule.response.bodyMode === 'dataset' && <Database size={11} aria-label="Dataset response" />}
                  {latency && (
                    <span className="flex items-center gap-0.5" title={`Latency: ${LATENCY_PROFILES[rule.network.latency].label}`}>
                      <Timer size={11} aria-hidden />
                    </span>
                  )}
                  {rule.network.failureRate > 0 && (
                    <span className="flex items-center gap-0.5 text-warn" title={`Failure injection: ${rule.network.failureRate}%`}>
                      <Shuffle size={11} aria-hidden />
                      {rule.network.failureRate}%
                    </span>
                  )}
                  <span className="font-mono text-faint tabular-nums" title="Hits this session">
                    {rule.response.status}
                    {hits[rule.id] ? ` / ${hits[rule.id]} hits` : ''}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
