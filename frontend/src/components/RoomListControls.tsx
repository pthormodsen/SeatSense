import type { GroupRoomStatusFilter, RoomSortKey, RoomTypeFilter } from '../utils/roomListing';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

const typeOptions: SegmentOption<RoomTypeFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'reading-room', label: 'Reading rooms' },
  { value: 'group-room', label: 'Group rooms' },
];

const groupStatusOptions: SegmentOption<GroupRoomStatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'booked-unused', label: 'Booked · empty' },
  { value: 'booked-in-use', label: 'In use' },
];

const sortOptions: SegmentOption<RoomSortKey>[] = [
  { value: 'availability', label: 'Availability' },
  { value: 'room-number', label: 'Room number' },
  { value: 'capacity', label: 'Capacity' },
];

interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const SegmentedControl = <T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) => (
  <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
    <span className="mr-1 text-xs text-slate-500">{label}</span>
    {options.map((option) => {
      const isActive = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={isActive}
          className={`rounded-md border px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
            isActive
              ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'
              : 'border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

interface GroupStatusControlProps {
  value: GroupRoomStatusFilter;
  onChange: (value: GroupRoomStatusFilter) => void;
}

// Status filter scoped to the Group rooms section; reading rooms have no
// room-level status to filter on.
export const GroupStatusControl = ({ value, onChange }: GroupStatusControlProps) => (
  <SegmentedControl label="Status" options={groupStatusOptions} value={value} onChange={onChange} />
);

interface RoomListControlsProps {
  query: string;
  onQueryChange: (value: string) => void;
  typeFilter: RoomTypeFilter;
  onTypeFilterChange: (value: RoomTypeFilter) => void;
  sortKey: RoomSortKey;
  onSortKeyChange: (value: RoomSortKey) => void;
}

const RoomListControls = ({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  sortKey,
  onSortKeyChange,
}: RoomListControlsProps) => (
  <div aria-label="Room list filters" role="toolbar" className="flex flex-wrap items-center gap-x-5 gap-y-2">
    <div className="relative w-full sm:w-52">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.58 3.58a.75.75 0 1 1-1.06 1.06l-3.58-3.58A7 7 0 0 1 2 9Z" clipRule="evenodd" />
      </svg>
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search room number"
        aria-label="Search rooms by number"
        className="w-full rounded-md border border-white/10 bg-surface-900 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-slate-500 transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
      />
    </div>
    <SegmentedControl label="Type" options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} />
    <SegmentedControl label="Sort" options={sortOptions} value={sortKey} onChange={onSortKeyChange} />
  </div>
);

export default RoomListControls;
