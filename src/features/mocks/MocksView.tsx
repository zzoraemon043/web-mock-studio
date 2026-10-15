import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Route } from 'lucide-react';
import { useWorkspace } from '../../store/workspace.ts';
import { useUi } from '../../store/ui.ts';
import { Button, EmptyState } from '../../components/ui.tsx';
import { RuleList } from './RuleList.tsx';
import { RuleEditor } from './RuleEditor.tsx';
import { TrafficPanel } from './TrafficPanel.tsx';
import { createAndSelectRule } from '../../app/actions.ts';
import { cx } from '../../lib/utils.ts';

export function MocksView() {
  const rules = useWorkspace((s) => s.rules);
  const selectedId = useUi((s) => s.selectedRuleId);
  const selectRule = useUi((s) => s.selectRule);
  const [trafficOpen, setTrafficOpen] = useState(true);
  const rule = rules.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!rule && rules[0]) selectRule(rules[0].id);
  }, [rule, rules, selectRule]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-line bg-panel xl:w-80">
        <RuleList />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          {rule ? (
            <RuleEditor key={rule.id} rule={rule} />
          ) : (
            <EmptyState
              icon={Route}
              title="No mock rule selected"
              action={
                <Button variant="primary" icon={Plus} onClick={() => createAndSelectRule()}>
                  Create a rule
                </Button>
              }
            >
              Rules intercept fetch and XMLHttpRequest calls in this browser tab and answer them with the response you design.
            </EmptyState>
          )}
        </div>
        <div className={cx('relative shrink-0', trafficOpen ? 'h-56' : 'h-9')}>
          <button
            type="button"
            onClick={() => setTrafficOpen((v) => !v)}
            aria-label={trafficOpen ? 'Collapse traffic log' : 'Expand traffic log'}
            className="absolute top-1.5 right-12 z-10 rounded p-1 text-muted hover:bg-hover hover:text-fg"
          >
            {trafficOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <TrafficPanel className="h-full" />
        </div>
      </div>
    </div>
  );
}
