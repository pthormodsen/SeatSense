// Shared Tailwind class strings for non-status UI. Status colours live in
// statusStyles.ts.

export const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70';

// The filled cyan treatment is reserved for the main action on a page or panel.
export const primaryButtonClass =
  `inline-flex items-center rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-surface-950 transition hover:bg-cyan-200 ${focusRingClass}`;

export const secondaryButtonClass =
  `inline-flex items-center rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white ${focusRingClass}`;

export const cardClass = 'rounded-lg border border-white/10 bg-surface-850';

// Whole-card links (building, floor).
export const linkCardClass =
  `${cardClass} block transition hover:border-cyan-300/40 hover:bg-surface-800 ${focusRingClass}`;
