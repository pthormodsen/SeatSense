import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm transition ${
    isActive ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`;

const Navbar = () => (
  <header className="sticky top-0 z-20 border-b border-white/10 bg-surface-950/90 backdrop-blur">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
      <NavLink to="/" className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-sm font-bold text-cyan-200">
          SS
        </span>
        <span>
          <span className="block text-base font-semibold text-white">SeatSense</span>
          <span className="block text-xs text-slate-400">Campus seat availability</span>
        </span>
      </NavLink>
      <div className="flex items-center gap-1">
        <NavLink to="/" className={linkClass}>
          Home
        </NavLink>
        <NavLink to="/building/kronstad" className={linkClass}>
          Kronstad
        </NavLink>
      </div>
    </nav>
  </header>
);

export default Navbar;
