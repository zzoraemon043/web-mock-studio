import { createRule } from '../core/defaults.ts';
import { serializeWorkspace } from '../core/workspace/io.ts';
import { downloadText } from '../lib/utils.ts';
import { useUi } from '../store/ui.ts';
import { selectWorkspaceData, useWorkspace } from '../store/workspace.ts';
import type { MockRule } from '../core/types.ts';

export function exportWorkspaceFile(): void {
  const text = serializeWorkspace(selectWorkspaceData(useWorkspace.getState()));
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`web-mock-studio-${stamp}.json`, text);
  useUi.getState().toast('Workspace exported', 'success');
}

export function createAndSelectRule(partial?: Partial<MockRule>): MockRule {
  const rule = useWorkspace.getState().addRule(partial ?? createRule());
  const ui = useUi.getState();
  ui.selectRule(rule.id);
  ui.setTool('mocks');
  return rule;
}

export function toggleInterception(): void {
  const { settings, updateSettings } = useWorkspace.getState();
  updateSettings({ interceptionEnabled: !settings.interceptionEnabled });
  useUi.getState().toast(settings.interceptionEnabled ? 'Interception paused; requests go to the network' : 'Interception enabled', 'info');
}

/** Substitutes sample values for path params so a rule can be exercised from the runner. */
export function sampleUrlForPattern(pattern: string): string {
  return pattern
    .replace(/\/:([A-Za-z_$][\w$]*)\?/g, '/1')
    .replace(/\/:([A-Za-z_$][\w$]*)/g, '/1')
    .replace(/\/\{[^}]+\}/g, '/1')
    .replace(/\/\*\*?$/, '/example');
}
