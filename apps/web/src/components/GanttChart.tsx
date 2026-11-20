import { useMemo } from 'react';
import type { FlightOutcome, NetworkData } from '../api.js';
import { formatClock } from '../utils.js';

interface Props {
  flights: FlightOutcome[];
  network: NetworkData;
}

const DAY_START = 300;  // 05:00
const DAY_END = 1500;   // 25:00 (01:00+1)
const TOTAL_MIN = DAY_END - DAY_START;

function pct(minutes: number): number {
  return ((minutes - DAY_START) / TOTAL_MIN) * 100;
}

export default function GanttChart({ flights, network }: Props) {
  const rows = useMemo(() => {
    const byAircraft = new Map<string, FlightOutcome[]>();
    for (const f of flights) {
      if (!byAircraft.has(f.aircraftId)) byAircraft.set(f.aircraftId, []);
      byAircraft.get(f.aircraftId)!.push(f);
    }
    // Sort aircraft by ID
    const sorted = [...byAircraft.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted;
  }, [flights]);

  // Time axis ticks every 2 hours
  const ticks = useMemo(() => {
    const t: { label: string; pctLeft: number }[] = [];
    for (let m = DAY_START; m <= DAY_END; m += 120) {
      t.push({ label: formatClock(m), pctLeft: pct(m) });
    }
    return t;
  }, []);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title"><span className="icon">📊</span> Aircraft Gantt Chart</h3>
        <span className="card-subtitle">{network.aircraft.length} aircraft, {flights.length} flights</span>
      </div>
      <div className="gantt-container" role="img" aria-label="Aircraft utilisation Gantt chart">
        {rows.map(([acId, acFlights]) => (
          <div className="gantt-row" key={acId}>
            <span className="gantt-label">{acId}</span>
            <div className="gantt-track">
              {acFlights.map((f) => {
                const schedLeft = pct(f.schedDep);
                const schedWidth = Math.max((f.blockMin / TOTAL_MIN) * 100, 0.4);

                // Ghost bar (scheduled)
                const ghost = (
                  <div
                    key={`${f.flightId}-ghost`}
                    className="gantt-bar ghost"
                    style={{ left: `${schedLeft}%`, width: `${schedWidth}%` }}
                    title={`${f.flightId} scheduled: ${formatClock(f.schedDep)}–${formatClock(f.schedArr)} ${f.origin}→${f.destination}`}
                  />
                );

                if (f.status === 'CANCELLED') {
                  return (
                    <span key={f.flightId}>
                      {ghost}
                      <div
                        className="gantt-bar cancelled"
                        style={{ left: `${schedLeft}%`, width: `${schedWidth}%` }}
                        title={`${f.flightId} CANCELLED ${f.origin}→${f.destination}`}
                      >
                        {schedWidth > 3 ? f.flightId : ''}
                      </div>
                    </span>
                  );
                }

                const actualLeft = pct(f.actualDep ?? f.schedDep);
                const actualWidth = Math.max((f.blockMin / TOTAL_MIN) * 100, 0.4);
                const statusCls = f.status === 'DELAYED' ? 'delayed' : 'on-time';

                return (
                  <span key={f.flightId}>
                    {f.delayMin > 0 && ghost}
                    <div
                      className={`gantt-bar ${statusCls}`}
                      style={{ left: `${actualLeft}%`, width: `${actualWidth}%` }}
                      title={`${f.flightId} ${f.origin}→${f.destination} actual: ${formatClock(f.actualDep!)}–${formatClock(f.actualArr!)}${f.delayMin > 0 ? ` (+${f.delayMin}m)` : ''}`}
                    >
                      {actualWidth > 3 ? f.flightId : ''}
                    </div>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <div className="gantt-time-axis">
          {ticks.map((t) => (
            <span key={t.label} className="gantt-tick" style={{ left: `${t.pctLeft}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

