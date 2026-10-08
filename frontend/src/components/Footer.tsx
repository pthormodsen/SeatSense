import { Link } from 'react-router-dom';

const Footer = () => (
  <footer className="mt-24 overflow-hidden border-t border-white/10">
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
      <p
        aria-hidden="true"
        className="select-none text-[clamp(3.5rem,16vw,13rem)] font-semibold leading-[0.85] tracking-tighter text-white/[0.06]"
      >
        Seat<span className="accent-serif">Sense</span>
      </p>
      <div className="mt-8 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Study-seat availability for Campus Kronstad. All values are demo data.</p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link to="/" className="transition-colors hover:text-white">Home</Link>
          <Link to="/building/kronstad" className="transition-colors hover:text-white">Kronstad</Link>
        </nav>
      </div>
    </div>
  </footer>
);

export default Footer;
