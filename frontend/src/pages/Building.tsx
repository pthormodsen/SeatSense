import { Navigate, useParams } from 'react-router-dom';
import AvailabilitySummary from '../components/AvailabilitySummary';
import DemoDataBadge from '../components/DemoDataBadge';
import FloorCard from '../components/FloorCard';
import PageHeader from '../components/PageHeader';
import { cardClass } from '../components/uiStyles';
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
      <PageHeader
        breadcrumbs={[{ label: building.campusName, to: '/' }, { label: building.name }]}
        title={building.name}
        description={building.description}
        actions={<DemoDataBadge />}
      />

      <section aria-label="Building availability" className={`${cardClass} p-5`}>
        <AvailabilitySummary summary={summary} />
      </section>

      <section aria-labelledby="floors-heading">
        <h2 id="floors-heading" className="mb-3 text-lg font-semibold text-white">Floors</h2>
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
