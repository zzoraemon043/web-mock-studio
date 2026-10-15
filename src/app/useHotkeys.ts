import { useEffect } from 'react';
import { TOOLS, useUi } from '../store/ui.ts';
import { createAndSelectRule, toggleInterception } from './actions.ts';

/**
 * Alt shortcuts match on `event.code` rather than `event.key`: on macOS, Option+1
 * yields characters like "¡" in `key`, while `code` stays "Digit1" on every layout.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (digit?.[1]) {
        e.preventDefault();
        const tool = TOOLS[Number(digit[1]) - 1];
        if (tool) ui.setTool(tool);
        ui.setPaletteOpen(false);
        return;
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        createAndSelectRule();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        toggleInterception();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
