import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { liveSensorStatusStyles, liveTimelineStyles } from '../components/statusStyles';
import { cardClass, focusRingClass, primaryButtonClass, secondaryButtonClass } from '../components/uiStyles';
import {
  TARGET_TYPE_LABELS,
  downloadCsv,
  getLiveStatus,
  liveSensorService,
  mergeEvents,
  timelineToCsv,
  type StreamStatus,
  type TestNote,
  type TimelineEntry,
} from '../services/liveSensorService';
import type { SensorEvent, SensorState } from '../types/liveSensor';

const TIMELINE_ROWS = 200;

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const formatAge = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s ago`;
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min ago`;
};

const formatUptime = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min ${total % 60} s`;
};

const orDash = (value: number | null, unit = '') => (value === null ? '–' : `${value}${unit}`);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2 last:border-0">
    <dt className="text-sm text-slate-400">{label}</dt>
    <dd className="text-right text-sm font-medium tabular-nums text-slate-100">{children}</dd>
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-white/5 bg-surface-900 px-3 py-2.5">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
  </div>
);

const describeEntry = (entry: TimelineEntry): string => {
  if (entry.type === 'note') return entry.text;
  if (entry.type === 'offline') return 'No reading within the offline timeout';
  const occupancy = entry.occupied === null ? 'No radar data' : entry.occupied ? 'Occupied' : 'Available';
  if (entry.targetType === null || entry.targetType === 0) return occupancy;
  const distance = entry.targetType === 1 ? entry.movingCm : entry.stationaryCm;
  return `${occupancy} · ${TARGET_TYPE_LABELS[entry.targetType]?.toLowerCase() ?? 'target'}${distance === null ? '' : ` at ${distance} cm`}`;
};

const StreamBanner = ({ status }: { status: StreamStatus }) =>
  status === 'reconnecting' ? (
    <div role="status" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      Live connection to the server lost. Reconnecting… Values below may be out of date.
    </div>
  ) : null;

interface LiveSensorViewProps {
  sensorId: string;
  sensorPicker: ReactNode;
}

const LiveSensorView = ({ sensorId, sensorPicker }: LiveSensorViewProps) => {
  const [state, setState] = useState<SensorState | null>(null);
  const [events, setEvents] = useState<SensorEvent[]>([]);
  const [notes, setNotes] = useState<TestNote[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [deliveryMs, setDeliveryMs] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [noteText, setNoteText] = useState('');
  const now = useNow(1000);

  useEffect(() => {
    let cancelled = false;

    const loadEvents = () =>
      liveSensorService
        .getEvents(sensorId)
        .then((list) => {
          if (!cancelled) setEvents((current) => mergeEvents(current, list));
        })
        .catch((error: unknown) => {
          if (!cancelled) setLoadError(`Could not load the event log: ${errorMessage(error)}`);
        });

    liveSensorService
      .getState(sensorId)
      .then((initial) => {
        // A stream snapshot may already have arrived; it is at least as new.
        if (!cancelled) setState((current) => current ?? initial);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(`Could not load the sensor: ${errorMessage(error)}`);
      });

    const unsubscribe = liveSensorService.subscribe(sensorId, {
      onStatus: (status) => {
        if (!cancelled) setStreamStatus(status);
      },
      onMessage: (kind, message) => {
        if (cancelled) return;
        setState(message.state);
        setLoadError(null);
        if (kind === 'snapshot') {
          // Also after every reconnect: fill in events missed while offline.
          void loadEvents();
          return;
        }
        if (message.event) {
          setEvents((current) => mergeEvents(current, [message.event!]));
          if (message.event.type !== 'offline') {
            setDeliveryMs(Date.now() - Date.parse(message.pushedAt));
          }
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sensorId]);

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...events.filter((event) => showHeartbeats || event.type !== 'heartbeat'),
      ...notes,
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, TIMELINE_ROWS);
  }, [events, notes, showHeartbeats]);

  const heartbeatCount = useMemo(() => events.filter((event) => event.type === 'heartbeat').length, [events]);

  const exportCsv = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadCsv(`seatsense-${sensorId}-${stamp}.csv`, timelineToCsv([...events, ...notes]));
  }, [events, notes, sensorId]);

  const addNote = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setNotes((current) => [...current, { type: 'note', sensorId, at: new Date().toISOString(), text: trimmed }]);
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    addNote(noteText);
    setNoteText('');
  };

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Kronstad', to: '/' }, { label: 'Live sensor' }]}
      title="Live sensor"
      description="Real readings from one ESP32-S3 + HLK-LD2410C node. The rest of SeatSense still shows demo data."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {sensorPicker}
          <button
            type="button"
            className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={exportCsv}
            disabled={events.length === 0 && notes.length === 0}
          >
            Export CSV
          </button>
        </div>
      )}
    />
  );

  if (!state) {
    return (
      <div className="space-y-6">
        {header}
        {loadError ? (
          <div className={`${cardClass} p-6 text-sm text-rose-200`} role="alert">{loadError}</div>
        ) : (
          <div className="skeleton h-64 rounded-xl" role="status">
            <span className="sr-only">Connecting to {sensorId}…</span>
          </div>
        )}
      </div>
    );
  }

  const status = getLiveStatus(state);
  const statusStyle = liveSensorStatusStyles[status];
  const lastReceivedMs = state.lastReceivedAt ? Date.parse(state.lastReceivedAt) : null;

  return (
    <div className="space-y-6">
      {header}
      <StreamBanner status={streamStatus} />
      {loadError ? (
        <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className={`${cardClass} p-5 lg:col-span-2`} aria-labelledby="live-status-heading">
          <h2 id="live-status-heading" className="eyebrow">Seat status</h2>
          <div className={`mt-3 inline-flex items-center gap-3 rounded-full border px-5 py-2.5 text-2xl font-semibold tracking-tight ${statusStyle.badge}`}>
            <span className={`h-3.5 w-3.5 rounded-full ${statusStyle.dot} ${status !== 'offline' ? 'animate-pulse' : ''}`} />
            {statusStyle.label}
          </div>
          {status === 'offline' && state.occupied !== null ? (
            <p className="mt-2 text-xs text-slate-400">
              Last known: {state.occupied ? 'occupied' : 'available'}
            </p>
          ) : null}

          <dl className="mt-5">
            <Field label="Sensor ID">{state.sensorId}</Field>
            <Field label="Sensor">
              <span className={state.online ? 'text-emerald-200' : 'text-slate-400'}>
                {state.online ? 'Online' : lastReceivedMs === null ? 'Never connected' : 'Offline'}
              </span>
            </Field>
            <Field label="Last update">{lastReceivedMs === null ? '–' : formatAge(now - lastReceivedMs)}</Field>
            <Field label="Sensor → server">
              {state.latencyMs === null ? (state.online ? 'No NTP time yet' : '–') : `${state.latencyMs} ms`}
            </Field>
            <Field label="Server → browser">{deliveryMs === null ? '–' : `${deliveryMs} ms`}</Field>
            <Field label="Live stream">
              {streamStatus === 'open' ? 'Connected' : streamStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </Field>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Latencies compare clocks on different machines (NTP-synced), so expect tens of ms of error.
          </p>
        </section>

        <section className={`${cardClass} p-5 lg:col-span-3`} aria-labelledby="live-raw-heading">
          <h2 id="live-raw-heading" className="eyebrow">Raw radar values · latest reading</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Target type"
              value={state.targetType === null ? '–' : TARGET_TYPE_LABELS[state.targetType] ?? String(state.targetType)}
            />
            <Stat label="Moving distance" value={orDash(state.movingCm, ' cm')} />
            <Stat label="Stationary distance" value={orDash(state.stationaryCm, ' cm')} />
            <Stat label="Moving energy" value={orDash(state.movingEnergy)} />
            <Stat label="Stationary energy" value={orDash(state.stationaryEnergy)} />
            <Stat label="Wi-Fi RSSI" value={orDash(state.rssi, ' dBm')} />
            <Stat label="Sensor uptime" value={state.uptimeMs === null ? '–' : formatUptime(state.uptimeMs)} />
            <Stat label="Sequence no." value={orDash(state.seq)} />
            <Stat label="Sensor time" value={state.sentAt ? timeFormat.format(Date.parse(state.sentAt)) : '–'} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Raw values as the LD2410C reports them; energy is signal strength (0–100). The sensor decides the seat status itself: only targets within 1.5 m count, and a free seat needs a strong target for 3 s before it becomes occupied.
          </p>
        </section>
      </div>

      <section className={`${cardClass} p-5`} aria-labelledby="live-timeline-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="live-timeline-heading" className="eyebrow">Event timeline</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className={`h-4 w-4 accent-cyan-300 ${focusRingClass}`}
              checked={showHeartbeats}
              onChange={(event) => setShowHeartbeats(event.target.checked)}
            />
            Show heartbeats ({heartbeatCount})
          </label>
        </div>

        <form onSubmit={submitNote} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="live-note" className="sr-only">Test note</label>
          <input
            id="live-note"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Test note, e.g. “bag on chair, no person”"
            maxLength={200}
            className={`min-w-0 flex-1 rounded-full border border-white/15 bg-surface-900 px-4 py-2 text-sm text-white placeholder:text-slate-500 ${focusRingClass}`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={secondaryButtonClass}>Add note</button>
            <button type="button" className={secondaryButtonClass} onClick={() => addNote('Person sat down')}>
              Person sat down
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => addNote('Person left')}>
              Person left
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Notes are ground truth for the pilot test. They stay in this browser tab and are included in the CSV export.
        </p>

        {timeline.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">No events yet. They appear here when the sensor sends a reading.</p>
        ) : (
          <ol className="mt-4 divide-y divide-white/5">
            {timeline.map((entry) => {
              const style = liveTimelineStyles[entry.type];
              return (
                <li
                  key={entry.type === 'note' ? `note-${entry.at}-${entry.text}` : `${entry.id}-${entry.at}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <time dateTime={entry.at} className="w-20 shrink-0 tabular-nums text-slate-400">
                    {timeFormat.format(Date.parse(entry.at))}
                  </time>
                  <span className={`inline-flex w-24 justify-center rounded-md border px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="min-w-0 flex-1 text-slate-200">{describeEntry(entry)}</span>
                  {entry.type !== 'note' && entry.latencyMs !== null ? (
                    <span className="tabular-nums text-xs text-slate-500">{entry.latencyMs} ms</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-slate-500">
          The server keeps the last 500 events; this tab keeps up to 5,000 while open. Export before closing the tab.
        </p>
      </section>
    </div>
  );
};

const Live = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sensors, setSensors] = useState<SensorState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    liveSensorService
      .listSensors()
      .then((list) => {
        if (!cancelled) setSensors(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const requested = searchParams.get('sensor');
  const sensorId = sensors?.find((sensor) => sensor.sensorId === requested)?.sensorId ?? sensors?.[0]?.sensorId;

  if (!sensorId) {
    const message = error
      ? `Could not reach the SeatSense backend (${error}).`
      : sensors
        ? 'No sensors are configured on the backend (DEVICE_TOKENS is empty).'
        : 'Loading sensors…';
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: 'Kronstad', to: '/' }, { label: 'Live sensor' }]} title="Live sensor" />
        <div className={`${cardClass} flex flex-col gap-3 p-6 text-sm sm:flex-row sm:items-center sm:justify-between`}>
          <p className={error ? 'text-rose-200' : 'text-slate-400'} role="status">{message}</p>
          {error ? (
            <button type="button" className={secondaryButtonClass} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const picker =
    sensors && sensors.length > 1 ? (
      <select
        aria-label="Sensor"
        value={sensorId}
        onChange={(event) => setSearchParams({ sensor: event.target.value })}
        className={`rounded-full border border-white/15 bg-surface-900 px-4 py-2 text-sm text-slate-200 ${focusRingClass}`}
      >
        {sensors.map((sensor) => (
          <option key={sensor.sensorId} value={sensor.sensorId}>{sensor.sensorId}</option>
        ))}
      </select>
    ) : null;

  return <LiveSensorView key={sensorId} sensorId={sensorId} sensorPicker={picker} />;
};

export default Live;
