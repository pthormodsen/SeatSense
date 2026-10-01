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
  typeFilter: RoomTypeFilter;
  onTypeFilterChange: (value: RoomTypeFilter) => void;
  sortKey: RoomSortKey;
  onSortKeyChange: (value: RoomSortKey) => void;
}

const RoomListControls = ({
  typeFilter,
  onTypeFilterChange,
  sortKey,
  onSortKeyChange,
}: RoomListControlsProps) => (
  <div aria-label="Room list filters" role="toolbar" className="flex flex-wrap items-center gap-x-5 gap-y-2">
    <SegmentedControl label="Type" options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} />
    <SegmentedControl label="Sort" options={sortOptions} value={sortKey} onChange={onSortKeyChange} />
  </div>
);

export default RoomListControls;
