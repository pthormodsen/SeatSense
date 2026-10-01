import { Link } from 'react-router-dom';
import BuildingCard from '../components/BuildingCard';
import DemoDataBadge from '../components/DemoDataBadge';
import OccupancyBar from '../components/OccupancyBar';
import { linkCardClass, primaryButtonClass } from '../components/uiStyles';
import { seatService } from '../services/seatService';
import type { Building, Floor, OccupancySummary } from '../types/campus';

interface FloorPick {
  building: Building;
  floor: Floor;
  summary: OccupancySummary;
}

// Floor with the most free seats across the campus.
const getBestFloor = (buildings: Building[]): FloorPick | undefined =>
  buildings
    .flatMap((building) =>
      building.floors.map((floor) => ({ building, floor, summary: seatService.summarizeRooms(floor.rooms) })),
    )
    .filter((pick) => pick.summary.available > 0)
    .sort((a, b) => b.summary.available - a.summary.available)[0];

const BestFloorCard = ({ pick }: { pick: FloorPick }) => (
  <Link
    to={`/building/${pick.building.id}/floor/${pick.floor.id}`}
    className={`${linkCardClass} group p-5`}
  >
    <p className="text-sm text-slate-400">Most seats free right now</p>
    <p className="mt-2 text-xl font-semibold text-white">
      {pick.building.name}, {pick.floor.name}
    </p>
    <p className="mt-1 text-sm text-slate-400">
      <span className="font-medium text-emerald-200">{pick.summary.available}</span> of {pick.summary.total} seats free
    </p>
    <div className="mt-3">
      <OccupancyBar summary={pick.summary} size="sm" />
    </div>
    <p className="mt-4 text-sm font-medium text-cyan-200 group-hover:text-cyan-100">
      Open floor map <span aria-hidden="true">→</span>
    </p>
  </Link>
);

const Home = () => {
  const campus = seatService.getCampus();
  const bestFloor = getBestFloor(campus.buildings);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-200">{campus.name}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Find an available study seat before walking around looking for one.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            SeatSense shows which study seats are free, room by room, using desk presence sensors.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link to="/building/kronstad" className={primaryButtonClass}>
              Find a seat
            </Link>
            <DemoDataBadge />
          </div>
        </div>
        {bestFloor ? <BestFloorCard pick={bestFloor} /> : null}
      </section>

      <section aria-labelledby="buildings-heading">
        <h2 id="buildings-heading" className="mb-3 text-lg font-semibold text-white">Where to study</h2>
        <div className={`grid gap-4 ${campus.buildings.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {campus.buildings.map((building) => (
            <BuildingCard key={building.id} building={building} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
