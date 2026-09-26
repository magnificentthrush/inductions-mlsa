import { useClock } from '../lib/ClockProvider.tsx';
import { elapsedMs, formatElapsed, isOverTarget } from '../lib/clock.ts';

interface TimerProps {
  startedAt: string;
  targetMinutes: number;
  /** Size and weight classes. Colours go in colorClassName / overClassName so they never conflict. */
  className?: string;
  colorClassName?: string;
  overClassName?: string;
}

/** Live interview timer on the server's clock; turns amber at the target length. */
export function Timer({ startedAt, targetMinutes, className = '', colorClassName = '', overClassName = 'text-amber-600' }: TimerProps) {
  const { nowMs, offsetMs } = useClock();
  const ms = elapsedMs(startedAt, nowMs, offsetMs);
  const over = isOverTarget(ms, targetMinutes);
  const text = formatElapsed(ms);
  return (
    <span
      className={`tabular-nums ${over ? overClassName : colorClassName} ${className}`}
      data-over-target={over ? 'true' : undefined}
      aria-label={over ? `${text}, over the ${targetMinutes} minute target` : text}
    >
      {text}
    </span>
  );
}
