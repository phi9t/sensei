import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { LevelConfig } from '../engine/types';

export function TimelineHelp({ level }: { readonly level: LevelConfig }) {
  const [position, setPosition] = useState<{
    readonly side: 'above' | 'below';
    readonly offset: number;
  } | null>(null);
  const open = position !== null;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPosition(null);
    }
    const closeOnResize = () => setPosition(null);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  function dismiss() {
    setPosition(null);
    trigger.current?.focus();
  }

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const width = Math.min(27 * rem, window.innerWidth - 3 * rem);
    const left = Math.max(rem, Math.min(bounds.right - width, window.innerWidth - width - rem));
    setPosition({
      side: bounds.bottom > window.innerHeight * 0.55 ? 'above' : 'below',
      offset: left - bounds.left,
    });
  }

  return (
    <div
      className="timeline-help"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          dismiss();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPosition(null);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="text-button"
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        How to read this <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <div
          className="timeline-help__popover"
          data-position={position.side}
          style={{ '--help-offset': `${position.offset}px` } as CSSProperties}
          role="dialog"
          aria-labelledby={`${id}-title`}
          id={id}
        >
          <div className="timeline-help__heading">
            <h3 id={`${id}-title`}>Reading the timeline</h3>
            <button
              type="button"
              className="text-button"
              aria-label="Close timeline help"
              onClick={dismiss}
            >
              Close
            </button>
          </div>
          <dl>
            <div>
              <dt>Stage → rank</dt>
              <dd>
                A stage is a model partition. A rank is its worker. Several stages may share a rank.
              </dd>
            </div>
            <div>
              <dt>Color → microbatch</dt>
              <dd>
                A small part of the training batch. Follow the same color across stages and passes.
                D in a block label identifies its microbatch.
              </dd>
            </div>
            <div>
              <dt>F / B{level.operationModel?.backward === 'split' ? ' / W' : ''}</dt>
              <dd>
                {level.operationModel?.backward === 'split'
                  ? 'Forward, input gradient and weight gradient. B advances the backward chain; W completes the local parameter-gradient work.'
                  : 'Forward computes outputs; backward computes input and parameter gradients.'}
              </dd>
            </div>
            <div>
              <dt>Width → time</dt>
              <dd>
                Block width is duration in abstract ticks. Empty time is a bubble. Adding a block
                chooses its rank order; the engine computes its earliest legal start.
              </dd>
            </div>
            <div>
              <dt>A → stored activations</dt>
              <dd>
                Saved state needed for backward, counted in abstract units. Select a block to
                highlight its dependencies and stored activation interval.
              </dd>
            </div>
          </dl>
          <p>
            Scroll the timeline sideways to explore. Tab to a block and press Enter to inspect it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
