import { Link } from 'react-router-dom';
import { primaryButtonClass, secondaryButtonClass } from './uiStyles';

interface NotFoundProps {
  title?: string;
  message?: string;
}

// Shown for unknown routes and for ids that don't match any building, floor or room.
const NotFound = ({
  title = 'We couldn’t find that page',
  message = 'The link may be outdated, or the room or floor no longer exists.',
}: NotFoundProps) => (
  <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
    <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/5 text-2xl text-slate-400">
      ?
    </span>
    <h1 className="mt-5 text-2xl font-semibold text-white">{title}</h1>
    <p className="mt-2 text-sm text-slate-400">{message}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Link to="/" className={primaryButtonClass}>Back to home</Link>
      <Link to="/building/kronstad" className={secondaryButtonClass}>Browse Kronstad</Link>
    </div>
  </div>
);

export default NotFound;
