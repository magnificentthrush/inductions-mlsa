import { useRef, useState, type ReactNode } from 'react';
import { useRunAction } from './ActionProvider.tsx';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClasses(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' = 'sm'): string {
  const sizing = size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-10 px-4 text-sm';
  return `inline-flex shrink-0 items-center justify-center gap-1 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]}`;
}

interface ActionButtonProps {
  action: () => Promise<unknown>;
  children: ReactNode;
  /** Asks first. For actions that are awkward to undo. */
  confirm?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Accessible name, for buttons whose text is an arrow. Also the tooltip. */
  label?: string;
  className?: string;
}

/** Runs one server action and is disabled while it runs, so a double click does nothing. */
export function ActionButton({ action, children, confirm, variant, size, disabled, label, className = '' }: ActionButtonProps) {
  const run = useRunAction();
  const busy = useRef(false); // a ref, not state: two clicks in the same tick must still run once
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (busy.current) return;
    if (confirm && !window.confirm(confirm)) return;
    busy.current = true;
    setPending(true);
    try {
      await run(action);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
    >
      {children}
    </button>
  );
}
