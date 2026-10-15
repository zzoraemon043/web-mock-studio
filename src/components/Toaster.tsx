import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useUi } from '../store/ui.ts';
import { cx } from '../lib/utils.ts';

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const TONES = { info: 'text-accent', success: 'text-ok', error: 'text-bad' } as const;

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className="wms-enter pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-xs shadow-lg">
            <Icon size={15} className={cx('mt-px shrink-0', TONES[t.tone])} aria-hidden />
            <p className="min-w-0 flex-1 leading-relaxed break-words text-fg">{t.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 text-faint hover:text-fg">
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
