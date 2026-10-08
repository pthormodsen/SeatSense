import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// New page = start at the top. Search-param changes on the same page don't scroll.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
