import { Link, Navigate, useParams } from 'react-router-dom';
import FloorCard from '../components/FloorCard';
import StatCard from '../components/StatCard';
import { seatService } from '../services/seatService';

const Building = () => {
  const { buildingId } = useParams();
  const building = buildingId ? seatService.getBuilding(buildingId) : undefined;

  if (!building) {
    return <Navigate to="/" replace />;
  }

  const summary = seatService.summarizeFloors(building.floors);

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-cyan-200 hover:text-cyan-100">
          Back to dashboard
        </Link>
        <p className="mt-4 text-sm uppercase tracking-wide text-cyan-200">{building.campusName}</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">{building.name}</h1>
        <p className="mt-3 max-w-2xl text-slate-300">{building.description}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={summary.available} />
        <StatCard label="Occupied" value={summary.occupied} />
        <StatCard label="Total seats" value={summary.total} />
        <StatCard label="Occupancy" value={`${summary.occupancyPercent}%`} />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Floors</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {building.floors.map((floor) => (
            <FloorCard key={floor.id} floor={floor} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Building;
