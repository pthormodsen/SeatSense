// Shared Tailwind class strings for non-status UI. Status colours live in
// statusStyles.ts.

export const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70';

// The filled ivory pill is reserved for the main action on a page or panel.
export const primaryButtonClass =
  `group inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-surface-950 transition duration-200 hover:bg-white active:scale-[0.98] ${focusRingClass}`;

export const secondaryButtonClass =
  `inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300 transition duration-200 hover:border-white/40 hover:bg-white/5 hover:text-white active:scale-[0.98] ${focusRingClass}`;

export const cardClass = 'rounded-xl border border-white/10 bg-surface-850';

// Whole-card links (building, floor).
export const linkCardClass =
  `${cardClass} block transition duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-surface-800 ${focusRingClass}`;
