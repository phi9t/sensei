import type { ReactNode } from 'react';

/** Move between reading and practice without replacing a shared attempt's URL fragment. */
export function SectionJump({
  target,
  children,
  className = '',
}: {
  readonly target: 'learn' | 'schedule-board-heading' | 'source-reading';
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      className={`text-link ${className}`}
      onClick={() => {
        const section = document.getElementById(target);
        section?.scrollIntoView({ block: 'start' });
        section?.focus({ preventScroll: true });
      }}
    >
      {children}
    </button>
  );
}
