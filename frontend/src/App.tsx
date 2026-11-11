import { useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import NotFound from './components/NotFound';
import ScrollToTop from './components/ScrollToTop';
import { ToastProvider } from './components/Toast';
import Building from './pages/Building';
import Floor from './pages/Floor';
import Home from './pages/Home';
import Live from './pages/Live';
import Room from './pages/Room';

// Floors share one key so switching floor (also from inside the map) keeps the
// MazeMap instance and the page state instead of remounting and flashing.
const getTransitionKey = (pathname: string) => pathname.replace(/\/floor\/[^/]+$/, '/floor');

const App = () => {
  const { pathname } = useLocation();
  const transitionKey = getTransitionKey(pathname);
  // The wipe only plays on navigation, not on the first render.
  const firstKey = useRef(transitionKey);
  const isNavigation = transitionKey !== firstKey.current;

  return (
    <ToastProvider>
      <div className="grain min-h-screen text-slate-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-cyan-300 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-surface-950"
        >
          Skip to content
        </a>
        <ScrollToTop />
        <Navbar />
        {isNavigation ? <div key={`curtain-${transitionKey}`} aria-hidden="true" className="route-curtain" /> : null}
        {/* Keyed so each page fades in underneath the wipe. */}
        <main id="main" key={transitionKey} className="page-enter mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/building/:buildingId" element={<Building />} />
            <Route path="/building/:buildingId/floor/:floorId" element={<Floor />} />
            <Route path="/room/:roomId" element={<Room />} />
            <Route path="/live" element={<Live />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </ToastProvider>
  );
};

export default App;
