import { Link } from 'react-router-dom';
import BuildingCard from '../components/BuildingCard';
import DemoDataBadge from '../components/DemoDataBadge';
import OccupancyBar from '../components/OccupancyBar';
import Reveal from '../components/Reveal';
import { focusRingClass, primaryButtonClass } from '../components/uiStyles';
import { seatService } from '../services/seatService';
import type { Building, Floor, OccupancySummary } from '../types/campus';

interface FloorPick {
  building: Building;
  floor: Floor;
  summary: OccupancySummary;
}

const getFloorPicks = (buildings: Building[]): FloorPick[] =>
  buildings.flatMap((building) =>
    building.floors.map((floor) => ({ building, floor, summary: seatService.summarizeRooms(floor.rooms) })),
  );

// Floor with the most free seats across the campus.
const getBestFloor = (picks: FloorPick[]): FloorPick | undefined =>
  picks.filter((pick) => pick.summary.available > 0).sort((a, b) => b.summary.available - a.summary.available)[0];

const steps = [
  {
    title: 'Sensors at the seat',
    text: 'Small radar sensors notice whether a seat is in use. No cameras, no images.',
  },
  {
    title: 'Status, not surveillance',
    text: 'Each seat is only ever free, occupied, recently used or offline. Nothing else is recorded.',
  },
  {
    title: 'Walk straight to a free seat',
    text: 'See the floor on a map, pick a room, and know before you leave your desk.',
  },
];

const BestFloorCard = ({ pick }: { pick: FloorPick }) => (
  <Link
    to={`/building/${pick.building.id}/floor/${pick.floor.id}`}
    className={`group block rounded-2xl border border-white/10 bg-surface-900 p-6 transition duration-300 hover:-translate-y-1 hover:border-white/30 ${focusRingClass}`}
  >
    <p className="eyebrow">Most seats free right now</p>
    <p className="mt-6 text-8xl font-semibold leading-none tracking-tighter text-emerald-200 tabular-nums">
      {pick.summary.available}
    </p>
    <p className="mt-3 text-slate-300">
      {pick.building.name}, {pick.floor.name}
    </p>
    <p className="text-sm text-slate-500">of {pick.summary.total} seats</p>
    <div className="mt-5">
      <OccupancyBar summary={pick.summary} size="sm" />
    </div>
    <p className="mt-5 text-sm font-medium text-cyan-200">
      Open floor map <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span>
    </p>
  </Link>
);

// Endless strip of per-floor availability. The duplicate half is hidden from
// assistive tech.
const Ticker = ({ picks }: { picks: FloorPick[] }) => {
  const items = picks.map((pick) => (
    <li key={`${pick.building.id}-${pick.floor.id}`} className="flex shrink-0 items-center gap-4">
      <span className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
        {pick.floor.name}
      </span>
      <span className="accent-serif text-3xl text-emerald-200 sm:text-5xl">{pick.summary.available} free</span>
      <span aria-hidden="true" className="px-4 text-2xl text-white/20 sm:px-8">✦</span>
    </li>
  ));

  return (
    <section aria-label="Free seats per floor" className="overflow-hidden border-y border-white/10 py-6 sm:py-8">
      <div className="flex w-max animate-marquee gap-0">
        <ul className="flex shrink-0 items-center">{items}</ul>
        <ul aria-hidden="true" className="flex shrink-0 items-center">{items}</ul>
      </div>
    </section>
  );
};

const Home = () => {
  const campus = seatService.getCampus();
  const picks = getFloorPicks(campus.buildings);
  const bestFloor = getBestFloor(picks);

  return (
    <div className="space-y-24 sm:space-y-32">
      <section className="grid gap-10 pt-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end sm:pt-10">
        <div>
          <p className="eyebrow animate-fade-up">{campus.name}</p>
          <h1 className="mt-6 text-[clamp(3rem,10vw,8.5rem)] font-semibold leading-[0.92] tracking-tighter text-white">
            <span className="line-mask"><span style={{ '--d': '200ms' } as React.CSSProperties}>Find a seat</span></span>
            <span className="line-mask"><span style={{ '--d': '320ms' } as React.CSSProperties}>before you</span></span>
            <span className="line-mask"><span style={{ '--d': '440ms' } as React.CSSProperties}>start <span className="accent-serif text-emerald-200">walking.</span></span></span>
          </h1>
          <p className="mt-8 max-w-xl animate-fade-up text-lg leading-8 text-slate-300 [animation-delay:700ms]">
            SeatSense shows which study seats are free, room by room, using desk presence sensors.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-4 [animation-delay:800ms]">
            <Link to="/building/kronstad" className={primaryButtonClass}>
              Find a seat
              <span className="arrow-disc" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M3 10a.75.75 0 0 1 .75-.75h10.69l-3.97-3.97a.75.75 0 0 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.97-3.97H3.75A.75.75 0 0 1 3 10Z" />
                </svg>
              </span>
            </Link>
            <DemoDataBadge />
          </div>
        </div>
        {bestFloor ? (
          <div className="animate-fade-up [animation-delay:900ms]">
            <BestFloorCard pick={bestFloor} />
          </div>
        ) : null}
      </section>

      {picks.length > 0 ? <Ticker picks={picks} /> : null}

      <section aria-labelledby="buildings-heading">
        <Reveal>
          <p className="eyebrow">01 · Where to study</p>
          <h2 id="buildings-heading" className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Pick a <span className="accent-serif">building.</span>
          </h2>
        </Reveal>
        <div className="mt-10 space-y-4">
          {campus.buildings.map((building, index) => (
            <Reveal key={building.id} delay={index * 80}>
              <BuildingCard building={building} index={index} />
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-heading">
        <Reveal>
          <p className="eyebrow">02 · How it works</p>
          <h2 id="how-heading" className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            From a sensor on the desk to a seat <span className="accent-serif">you can trust.</span>
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-surface-950">
              <Reveal delay={index * 100} className="h-full p-6 sm:p-8">
                <span className="text-sm tabular-nums text-slate-500">0{index + 1}</span>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight text-white">{step.title}</h3>
                <p className="mt-3 text-slate-400">{step.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

export default Home;
