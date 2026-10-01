import { useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  WEEKDAY_SHORT_LABELS,
  getBusyLevel,
  getBusyLevelLabel,
  type PopularTimesDay,
} from '../demo/popularTimes';
import DemoDataBadge from './DemoDataBadge';

interface PopularTimesProps {
  // One entry per weekday (Mon = 0 … Sun = 6), from seatService.getPopularTimes.
  days: PopularTimesDay[];
  typicalStayText: string;
  // Demo "now", used for the default selection and the now marker.
  nowWeekday: number;
  nowHour: number;
  className?: string;
}

const WEEKDAY_FULL_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const AXIS_LABEL_HOURS = new Set([6, 9, 12, 15, 18, 21]);

const focusClasses = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70';

const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

// Arrow/Home/End navigation over a list of `count` items, wrapping at the ends.
const getNextIndex = (key: string, index: number, count: number): number | null => {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
};

// Presentation and selection state only; the values come from seatService.
const PopularTimes = ({ days, typicalStayText, nowWeekday, nowHour, className = '' }: PopularTimesProps) => {
  const idPrefix = useId();
  const [selectedWeekday, setSelectedWeekday] = useState(nowWeekday);
  const [selectedHour, setSelectedHour] = useState(nowHour);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const barRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const day = days.find((entry) => entry.weekday === selectedWeekday) ?? days[0];

  if (!day) {
    return null;
  }

  const points = day.points;
  const selectedPoint = points.find((point) => point.hour === selectedHour) ?? points[0];
  const selectedHourIndex = points.indexOf(selectedPoint);
  const isNowDay = day.weekday === nowWeekday;
  const isSelectedNow = isNowDay && selectedPoint.hour === nowHour;
  const dayName = WEEKDAY_FULL_LABELS[day.weekday];
  const panelId = `${idPrefix}-panel`;
  const tabId = (weekday: number) => `${idPrefix}-tab-${weekday}`;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = getNextIndex(event.key, index, days.length);

    if (next === null) return;

    event.preventDefault();
    setSelectedWeekday(days[next].weekday);
    tabRefs.current[next]?.focus();
  };

  const handleBarKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = getNextIndex(event.key, index, points.length);

    if (next === null) return;

    event.preventDefault();
    setSelectedHour(points[next].hour);
    barRefs.current[next]?.focus();
  };

  return (
    <section
      aria-labelledby="popular-times-heading"
      className={`rounded-lg border border-white/10 bg-surface-850 p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="popular-times-heading" className="whitespace-nowrap text-base font-semibold text-white">
          Popular times
        </h2>
        <DemoDataBadge label="Demo data · Simulated pattern" />
      </div>
      <p className="mt-1 text-xs text-slate-500">Typical occupancy by hour. Not measured.</p>

      <div role="tablist" aria-label="Day of week" className="mt-4 grid grid-cols-7 gap-1">
        {days.map((entry, index) => {
          const isSelected = entry.weekday === day.weekday;

          return (
            <button
              key={entry.weekday}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId(entry.weekday)}
              aria-selected={isSelected}
              aria-controls={panelId}
              aria-label={WEEKDAY_FULL_LABELS[entry.weekday]}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedWeekday(entry.weekday)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${focusClasses} ${
                isSelected
                  ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {WEEKDAY_SHORT_LABELS[entry.weekday]}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(day.weekday)}>
        <p aria-live="polite" className="mt-4 text-sm">
          <span className="font-semibold tabular-nums text-white">{formatHour(selectedPoint.hour)}</span>
          <span className="text-slate-400">: {getBusyLevelLabel(getBusyLevel(selectedPoint.occupancyPercent))}</span>
          {isSelectedNow ? <span className="text-xs text-cyan-200"> · now</span> : null}
        </p>

        <div className="relative mt-3 h-24 sm:h-28">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {[25, 50, 75].map((percent) => (
              <div key={percent} className="absolute inset-x-0 border-t border-dashed border-white/[0.06]" style={{ bottom: `${percent}%` }} />
            ))}
            <div className="absolute inset-x-0 bottom-0 border-t border-white/10" />
          </div>

          <div
            role="group"
            aria-label={`Typical busyness by hour, ${dayName}`}
            className="relative flex h-full items-end gap-0.5 sm:gap-1"
          >
            {points.map((point, index) => {
              const isSelected = index === selectedHourIndex;
              const isNow = isNowDay && point.hour === nowHour;
              const showNowDot = isNow && !isSelected;
              const label = getBusyLevelLabel(getBusyLevel(point.occupancyPercent)).toLowerCase();
              const fill =
                point.occupancyPercent === 0
                  ? 'bg-white/10'
                  : isSelected
                    ? 'bg-cyan-300'
                    : 'bg-cyan-700 group-hover:bg-cyan-600';

              return (
                <button
                  key={point.hour}
                  ref={(element) => {
                    barRefs.current[index] = element;
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${dayName} ${formatHour(point.hour)}, ${label}${isNow ? ', now' : ''}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setSelectedHour(point.hour)}
                  onKeyDown={(event) => handleBarKeyDown(event, index)}
                  className={`group relative flex h-full min-w-0 flex-1 items-end rounded-t-[3px] ${focusClasses}`}
                >
                  <span
                    className={`block w-full rounded-t-[3px] transition-colors ${fill}`}
                    style={{ height: `${Math.max(point.occupancyPercent, 3)}%` }}
                  />
                  {showNowDot ? (
                    <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-cyan-200" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div aria-hidden="true" className="mt-1.5 flex gap-0.5 text-[11px] tabular-nums text-slate-500 sm:gap-1">
          {points.map((point) => (
            <span key={point.hour} className="flex min-w-0 flex-1 justify-center whitespace-nowrap leading-none">
              {AXIS_LABEL_HOURS.has(point.hour) ? String(point.hour).padStart(2, '0') : '\u00a0'}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-xs text-slate-400">{typicalStayText}</p>
    </section>
  );
};

export default PopularTimes;
