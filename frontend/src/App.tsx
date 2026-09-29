import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Building from './pages/Building';
import Floor from './pages/Floor';
import Home from './pages/Home';
import Room from './pages/Room';

const App = () => (
  <div className="min-h-screen text-slate-100">
    <Navbar />
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/building/:buildingId" element={<Building />} />
        <Route path="/building/:buildingId/floor/:floorId" element={<Floor />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </main>
  </div>
);

export default App;
