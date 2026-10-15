import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createRule, createSavedRequest, createStarterWorkspace, createId } from '../core/defaults.ts';
import type { DataTemplate, MockRule, SavedRequest, WorkspaceData, WorkspaceSettings } from '../core/types.ts';
import { mergeWorkspace, type MergeMode } from '../core/workspace/io.ts';
import { workspaceStorage } from '../lib/idb-storage.ts';

export interface WorkspaceState extends WorkspaceData {
  hydrated: boolean;
  addRule: (partial?: Partial<MockRule>) => MockRule;
  updateRule: (id: string, patch: Partial<MockRule> | ((rule: MockRule) => MockRule)) => void;
  duplicateRule: (id: string) => MockRule | undefined;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  moveRule: (id: string, direction: -1 | 1) => void;
  saveTemplate: (template: DataTemplate) => void;
  removeTemplate: (id: string) => void;
  saveRequest: (request: Partial<SavedRequest> & { id?: string }) => SavedRequest;
  removeRequest: (id: string) => void;
  updateSettings: (patch: Partial<WorkspaceSettings>) => void;
  importWorkspace: (data: WorkspaceData, mode: MergeMode) => void;
  resetWorkspace: (empty?: boolean) => void;
}

const starter = createStarterWorkspace();

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...starter,
      hydrated: false,

      addRule(partial) {
        const rule = createRule(partial);
        set((s) => ({ rules: [rule, ...s.rules] }));
        return rule;
      },
      updateRule(id, patch) {
        set((s) => ({
          rules: s.rules.map((r) => {
            if (r.id !== id) return r;
            const next = typeof patch === 'function' ? patch(r) : { ...r, ...patch };
            return { ...next, updatedAt: Date.now() };
          }),
        }));
      },
      duplicateRule(id) {
        const source = get().rules.find((r) => r.id === id);
        if (!source) return undefined;
        const now = Date.now();
        const copy: MockRule = { ...structuredClone(source), id: createId('rule'), name: `${source.name} (copy)`, createdAt: now, updatedAt: now };
        set((s) => {
          const index = s.rules.findIndex((r) => r.id === id);
          const rules = [...s.rules];
          rules.splice(index + 1, 0, copy);
          return { rules };
        });
        return copy;
      },
      removeRule(id) {
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
      },
      toggleRule(id) {
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled, updatedAt: Date.now() } : r)) }));
      },
      moveRule(id, direction) {
        set((s) => {
          const index = s.rules.findIndex((r) => r.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= s.rules.length) return s;
          const rules = [...s.rules];
          const [moved] = rules.splice(index, 1);
          if (moved) rules.splice(target, 0, moved);
          return { rules };
        });
      },
      saveTemplate(template) {
        set((s) => {
          const exists = s.templates.some((t) => t.id === template.id);
          const next = { ...template, updatedAt: Date.now() };
          return { templates: exists ? s.templates.map((t) => (t.id === template.id ? next : t)) : [next, ...s.templates] };
        });
      },
      removeTemplate(id) {
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
      },
      saveRequest(request) {
        const existing = request.id ? get().requests.find((r) => r.id === request.id) : undefined;
        const saved: SavedRequest = existing ? { ...existing, ...request, id: existing.id } : createSavedRequest(request);
        set((s) => ({ requests: existing ? s.requests.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...s.requests] }));
        return saved;
      },
      removeRequest(id) {
        set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }));
      },
      updateSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },
      importWorkspace(data, mode) {
        const s = get();
        set(mergeWorkspace({ rules: s.rules, templates: s.templates, requests: s.requests, settings: s.settings }, data, mode));
      },
      resetWorkspace(empty = false) {
        const fresh = createStarterWorkspace();
        const theme = get().settings.theme;
        set(empty ? { rules: [], templates: [], requests: [], settings: { ...fresh.settings, theme } } : { ...fresh, settings: { ...fresh.settings, theme } });
      },
    }),
    {
      name: 'wms:workspace',
      version: 1,
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (s) => ({ rules: s.rules, templates: s.templates, requests: s.requests, settings: s.settings }),
      onRehydrateStorage: () => () => {
        useWorkspace.setState({ hydrated: true });
      },
    },
  ),
);

export function selectWorkspaceData(s: WorkspaceState): WorkspaceData {
  return { rules: s.rules, templates: s.templates, requests: s.requests, settings: s.settings };
}
