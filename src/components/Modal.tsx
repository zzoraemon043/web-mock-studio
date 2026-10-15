import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui.tsx';
import { cx } from '../lib/utils.ts';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-2xl' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('textarea, input, select, button:not([data-close])')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('wms-enter flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl', width)}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} data-close />
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
