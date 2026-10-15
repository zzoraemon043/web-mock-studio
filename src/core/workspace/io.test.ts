import { describe, expect, it } from 'vitest';
import { createRule, createStarterWorkspace } from '../defaults.ts';
import { mergeWorkspace, parseWorkspace, serializeWorkspace, WORKSPACE_FORMAT } from './io.ts';

describe('workspace io', () => {
  it('round-trips a workspace', () => {
    const data = createStarterWorkspace();
    const result = parseWorkspace(serializeWorkspace(data));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(data);
      expect(result.warnings).toEqual([]);
    }
  });

  it('rejects malformed input', () => {
    expect(parseWorkspace('{').ok).toBe(false);
    expect(parseWorkspace('[]').ok).toBe(false);
    expect(parseWorkspace('{"format":"other","rules":[]}').ok).toBe(false);
    expect(parseWorkspace('{"hello":1}').ok).toBe(false);
  });

  it('sanitizes and clamps untrusted fields', () => {
    const result = parseWorkspace(
      JSON.stringify({
        format: WORKSPACE_FORMAT,
        version: 99,
        rules: [{ method: 'HACK', pattern: '/x', response: { status: 9999, bodyMode: 'dataset', dataset: { templateId: 'gone', count: 1e9 } }, network: { latency: 'warp', failureRate: 500, failureOutcomes: [500, 'boom'] } }, 'junk'],
        templates: [{ name: 'T', schema: { type: 'object', properties: { a: { 'x-faker': 'notAKind' } } } }],
        settings: { theme: 'neon', logLimit: -4 },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [rule] = result.data.rules;
    expect(result.data.rules).toHaveLength(1);
    expect(rule?.method).toBe('GET');
    expect(rule?.response.status).toBe(599);
    expect(rule?.response.dataset.count).toBe(10_000);
    expect(rule?.network).toMatchObject({ latency: 'none', failureRate: 100, failureOutcomes: [500] });
    expect(rule?.id).toMatch(/^rule_/);
    expect(result.data.templates[0]?.schema.properties?.a).toEqual({});
    expect(result.data.settings).toMatchObject({ theme: 'system', logLimit: 10 });
    expect(result.warnings.some((w) => w.includes('newer'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('missing dataset template'))).toBe(true);
  });

  it('merges by id or replaces wholesale', () => {
    const current = createStarterWorkspace();
    const existing = current.rules[0];
    if (!existing) throw new Error('starter workspace has no rules');
    const incoming = { ...current, rules: [{ ...existing, name: 'Renamed' }, createRule({ name: 'New' })], templates: [], requests: [] };
    const merged = mergeWorkspace(current, incoming, 'merge');
    expect(merged.rules).toHaveLength(current.rules.length + 1);
    expect(merged.rules[0]?.name).toBe('Renamed');
    expect(merged.templates).toHaveLength(current.templates.length);
    const replaced = mergeWorkspace({ ...current, settings: { ...current.settings, theme: 'dark' } }, incoming, 'replace');
    expect(replaced.rules).toHaveLength(2);
    expect(replaced.settings.theme).toBe('dark');
  });
});
