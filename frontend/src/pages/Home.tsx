import { Link } from 'react-router-dom';
import BuildingCard from '../components/BuildingCard';
import StatCard from '../components/StatCard';
import { seatService } from '../services/seatService';

const Home = () => {
  const campus = seatService.getCampus();
  const summary = seatService.summarizeBuildings(campus.buildings);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-200">{campus.name}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Find an available study seat before walking around looking for one.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            SeatSense shows live room-by-room study seat availability using desk presence sensors connected to ESP32 nodes.
          </p>
          <Link
            to="/building/kronstad"
            className="mt-6 inline-flex rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-surface-950 transition hover:bg-cyan-200"
          >
            Find a seat
          </Link>
        </div>
        <div className="rounded-lg border border-white/10 bg-surface-850 p-5">
          <p className="text-sm text-slate-400">Live campus overview</p>
          <p className="mt-3 text-4xl font-semibold text-emerald-200">{summary.available}</p>
          <p className="mt-1 text-slate-300">available seats right now</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available seats" value={summary.available} />
        <StatCard label="Occupied seats" value={summary.occupied} />
        <StatCard label="Total seats" value={summary.total} />
        <StatCard label="Occupancy" value={`${summary.occupancyPercent}%`} detail="Across active study rooms" />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Buildings</h2>
          <span className="text-sm text-slate-400">Updated 4 seconds ago</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {campus.buildings.map((building) => (
            <BuildingCard key={building.id} building={building} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
