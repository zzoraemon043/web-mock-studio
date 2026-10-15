import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../lib/utils.ts';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 border border-transparent',
  secondary: 'bg-panel text-fg border border-line hover:bg-hover',
  ghost: 'text-muted hover:text-fg hover:bg-hover border border-transparent',
  danger: 'bg-panel text-bad border border-line hover:bg-bad hover:text-white hover:border-bad',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 14} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: number;
}

export function IconButton({ icon: Icon, label, active, size = 15, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon size={size} strokeWidth={2} aria-hidden />
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }>(function Input(
  { className, mono, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-8 min-w-0 rounded-md border bg-panel px-2.5 text-[13px] text-fg placeholder:text-faint focus:border-accent focus:outline-none',
        invalid ? 'border-bad' : 'border-line',
        mono && 'font-mono text-xs',
        className,
      )}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-8 min-w-0 rounded-md border border-line bg-panel px-2 text-[13px] text-fg focus:border-accent focus:outline-none',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, size = 'md', disabled }: SwitchProps) {
  const dims = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-4';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        'relative inline-flex shrink-0 items-center rounded-full border border-transparent p-[1px] transition-colors disabled:opacity-50',
        dims,
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span className={cx('rounded-full bg-white shadow-sm transition-transform', knob, checked ? shift : 'translate-x-0')} />
    </button>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-muted border-line',
  accent: 'bg-accent-soft text-accent border-transparent',
  ok: 'text-ok border-current/30 bg-transparent',
  warn: 'text-warn border-current/30 bg-transparent',
  bad: 'text-bad border-current/30 bg-transparent',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] font-medium whitespace-nowrap', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-subtle px-1 font-mono text-[10px] text-muted">{children}</kbd>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-ok',
  POST: 'text-accent',
  PUT: 'text-warn',
  PATCH: 'text-warn',
  DELETE: 'text-bad',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
  ANY: 'text-fg',
};

export function MethodTag({ method, className }: { method: string; className?: string }) {
  return <span className={cx('inline-block w-14 shrink-0 font-mono text-[11px] font-semibold', METHOD_COLORS[method] ?? 'text-muted', className)}>{method}</span>;
}

export function statusTone(status: number | null): BadgeTone {
  if (status === null) return 'neutral';
  if (status === 0) return 'bad';
  if (status < 300) return 'ok';
  if (status < 400) return 'accent';
  if (status < 500) return 'warn';
  return 'bad';
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel', className)}>
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <h3 className="text-xs font-semibold tracking-wide text-fg uppercase">{title}</h3>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-md border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-2.5 font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'h-6 text-[11px]' : 'h-7 text-xs',
            o.value === value ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-subtle text-muted">
        <Icon size={18} aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {children && <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
