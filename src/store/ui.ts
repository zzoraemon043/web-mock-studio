import { create } from 'zustand';

export const TOOLS = ['mocks', 'factory', 'runner', 'workspace'] as const;
export type ToolId = (typeof TOOLS)[number];

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface RunnerDraft {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: string;
  savedId?: string;
}

interface UiState {
  tool: ToolId;
  paletteOpen: boolean;
  selectedRuleId: string | null;
  selectedTemplateId: string | null;
  runnerDraft: RunnerDraft | null;
  curlImportOpen: boolean;
  toasts: Toast[];
  setTool: (tool: ToolId) => void;
  setPaletteOpen: (open: boolean) => void;
  selectRule: (id: string | null) => void;
  selectTemplate: (id: string | null) => void;
  openInRunner: (draft: RunnerDraft) => void;
  consumeRunnerDraft: () => RunnerDraft | null;
  setCurlImportOpen: (open: boolean) => void;
  toast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUi = create<UiState>()((set, get) => ({
  tool: 'mocks',
  paletteOpen: false,
  selectedRuleId: null,
  selectedTemplateId: null,
  runnerDraft: null,
  curlImportOpen: false,
  toasts: [],
  setTool: (tool) => set({ tool }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  selectRule: (selectedRuleId) => set({ selectedRuleId }),
  selectTemplate: (selectedTemplateId) => set({ selectedTemplateId }),
  openInRunner: (runnerDraft) => set({ runnerDraft, tool: 'runner' }),
  consumeRunnerDraft: () => {
    const draft = get().runnerDraft;
    if (draft) set({ runnerDraft: null });
    return draft;
  },
  setCurlImportOpen: (curlImportOpen) => set({ curlImportOpen, ...(curlImportOpen ? { tool: 'runner' as const } : {}) }),
  toast: (message, tone = 'info') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, message }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
