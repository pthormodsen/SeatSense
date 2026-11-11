import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { focusRingClass } from './uiStyles';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/building/kronstad', label: 'Kronstad', end: false },
  { to: '/live', label: 'Live sensor', end: false },
];

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `link-underline py-1 text-sm font-medium ${focusRingClass} ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'}`;

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While the overlay is open: lock page scroll and let Escape close it.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-surface-950/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className={`group relative z-50 flex items-center gap-2.5 rounded-full ${focusRingClass}`}>
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-400 transition-transform duration-300 group-hover:scale-125" />
          <span className="text-lg font-semibold tracking-tight text-white">
            Seat<span className="accent-serif text-xl">Sense</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 sm:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={desktopLinkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className={`relative z-50 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white transition hover:border-white/40 sm:hidden ${focusRingClass}`}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </nav>
    </header>

      {/* Outside the header: its backdrop-filter would otherwise trap this fixed overlay. */}
      {menuOpen ? (
        <div
          id="mobile-menu"
          className="fixed inset-0 z-30 flex animate-fade-in flex-col justify-end bg-surface-950 px-6 pb-12 pt-24 sm:hidden"
        >
          <ul className="space-y-1">
            {links.map((link, index) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `block animate-fade-up text-6xl font-semibold tracking-tight ${focusRingClass} ${isActive ? 'text-white' : 'text-slate-500 hover:text-white'}`
                  }
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-sm text-slate-500">Study-seat availability, room by room.</p>
        </div>
      ) : null}
    </>
  );
};

export default Navbar;
