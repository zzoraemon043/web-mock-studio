import { create } from 'zustand';

export type TrafficOutcome = 'mocked' | 'injected' | 'network-error' | 'passthrough' | 'pending';

export interface TrafficEntry {
  id: string;
  time: number;
  method: string;
  url: string;
  outcome: TrafficOutcome;
  status: number | null;
  ruleId: string | null;
  delayMs: number;
  durationMs: number | null;
}

export type EngineMode = 'starting' | 'service-worker' | 'page-patch' | 'unsupported';

interface TrafficState {
  entries: TrafficEntry[];
  mode: EngineMode;
  detail: string;
  hits: Record<string, number>;
  add: (entry: TrafficEntry, limit: number) => void;
  update: (id: string, patch: Partial<TrafficEntry>) => void;
  clear: () => void;
  setMode: (mode: EngineMode, detail?: string) => void;
}

export const useTraffic = create<TrafficState>()((set) => ({
  entries: [],
  mode: 'starting',
  detail: '',
  hits: {},
  add: (entry, limit) =>
    set((s) => ({
      entries: [entry, ...s.entries].slice(0, limit),
      hits: entry.ruleId ? { ...s.hits, [entry.ruleId]: (s.hits[entry.ruleId] ?? 0) + 1 } : s.hits,
    })),
  update: (id, patch) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  clear: () => set({ entries: [], hits: {} }),
  setMode: (mode, detail = '') => set({ mode, detail }),
}));
