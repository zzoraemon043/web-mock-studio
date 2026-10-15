import { useEffect } from 'react';
import type { ThemeMode } from '../core/types.ts';
import { useWorkspace } from '../store/workspace.ts';

export const THEME_STORAGE_KEY = 'wms:theme';

function apply(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  // Mirrored synchronously so the inline script in index.html can apply it before first paint.
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function useThemeSync(): void {
  const mode = useWorkspace((s) => s.settings.theme);
  useEffect(() => {
    apply(mode);
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);
}

export const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
