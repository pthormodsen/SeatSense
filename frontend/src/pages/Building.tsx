import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import AvailabilitySummary from '../components/AvailabilitySummary';
import DemoDataBadge from '../components/DemoDataBadge';
import FloorCard from '../components/FloorCard';
import NotFound from '../components/NotFound';
import PageHeader from '../components/PageHeader';
import { cardClass } from '../components/uiStyles';
import { seatService } from '../services/seatService';

const Building = () => {
  const { buildingId } = useParams();
  const building = buildingId ? seatService.getBuilding(buildingId) : undefined;

  if (!building) {
    return <NotFound title="Building not found" message="This building doesn’t exist in SeatSense." />;
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
        <h2 id="floors-heading" className="mb-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Floors</h2>
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {building.floors.map((floor, index) => (
            <div key={floor.id} style={{ '--i': index } as CSSProperties}>
              <FloorCard floor={floor} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Building;
