import { useEffect, useState } from 'react';

const STORAGE_KEY = 'seatsense:intro-seen';
const COUNT_MS = 1100;

const shouldPlay = () => {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }

    return window.sessionStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
};

// Short first-visit intro: a counter runs to 100 and the panel wipes upward.
// Plays once per browser session, never with reduced motion, and can be skipped.
const Intro = () => {
  const [phase, setPhase] = useState<'counting' | 'leaving' | 'done'>(() => (shouldPlay() ? 'counting' : 'done'));
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (phase !== 'counting') {
      return;
    }

    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Storage unavailable: the intro may replay, which is harmless.
    }

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / COUNT_MS, 1);
      setCount(Math.round(progress * 100));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setPhase('leaving');
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'leaving') {
      return;
    }

    const timer = window.setTimeout(() => setPhase('done'), 800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-between bg-surface-950 p-6 sm:p-10"
      style={phase === 'leaving' ? { animation: 'intro-out 800ms cubic-bezier(0.76, 0, 0.24, 1) both', pointerEvents: 'none' } : undefined}
    >
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span aria-hidden="true">SeatSense</span>
        <button
          type="button"
          onClick={() => setPhase('leaving')}
          className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 transition hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          Skip intro
        </button>
      </div>
      <div aria-hidden="true" className="flex items-end justify-between">
        <p className="text-5xl font-semibold tracking-tight text-white sm:text-7xl">
          Seat<span className="accent-serif">Sense</span>
        </p>
        <p className="text-5xl font-semibold tabular-nums text-slate-500 sm:text-7xl">{count}</p>
      </div>
    </div>
  );
};

export default Intro;
