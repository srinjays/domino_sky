import type { SimulationKpis } from '../api.js';
import { fmtNum, formatDuration } from '../utils.js';

interface Props {
  kpis: SimulationKpis;
  baselineKpis?: SimulationKpis;
}

function deltaStr(curr: number, base?: number): { text: string; cls: string } | null {
  if (base === undefined) return null;
  const d = curr - base;
  if (d === 0) return null;
  const sign = d > 0 ? '+' : '';
  return { text: `${sign}${d}`, cls: d < 0 ? 'positive' : 'negative' };
}

function colorClass(value: number, thresholds: [number, number, number]): string {
  if (value <= thresholds[0]) return 'green';
  if (value <= thresholds[1]) return 'yellow';
  if (value <= thresholds[2]) return 'orange';
  return 'red';
}

export default function KpiCards({ kpis, baselineKpis }: Props) {
  const cards: { label: string; value: string; color: string; delta: { text: string; cls: string } | null }[] = [
    {
      label: 'Delayed Flights',
      value: String(kpis.delayedFlights),
      color: colorClass(kpis.delayedFlights, [0, 5, 15]),
      delta: deltaStr(kpis.delayedFlights, baselineKpis?.delayedFlights),
    },
    {
      label: 'Cancelled Flights',
      value: String(kpis.cancelledFlights),
      color: colorClass(kpis.cancelledFlights, [0, 1, 3]),
      delta: deltaStr(kpis.cancelledFlights, baselineKpis?.cancelledFlights),
    },
    {
      label: 'Total Delay',
      value: formatDuration(kpis.totalDelayMin),
      color: colorClass(kpis.totalDelayMin, [0, 120, 500]),
      delta: deltaStr(kpis.totalDelayMin, baselineKpis?.totalDelayMin),
    },
    {
      label: 'Knock-on Flights',
      value: String(kpis.knockOnFlights),
      color: colorClass(kpis.knockOnFlights, [0, 3, 8]),
      delta: deltaStr(kpis.knockOnFlights, baselineKpis?.knockOnFlights),
    },
    {
      label: 'Stranded Pax',
      value: fmtNum(kpis.strandedPax),
      color: colorClass(kpis.strandedPax, [0, 20, 80]),
      delta: deltaStr(kpis.strandedPax, baselineKpis?.strandedPax),
    },
    {
      label: 'Broken Connections',
      value: String(kpis.brokenConnections),
      color: colorClass(kpis.brokenConnections, [0, 2, 5]),
      delta: deltaStr(kpis.brokenConnections, baselineKpis?.brokenConnections),
    },
    {
      label: 'Delayed Pax',
      value: fmtNum(kpis.delayedPax),
      color: colorClass(kpis.delayedPax, [0, 200, 1000]),
      delta: deltaStr(kpis.delayedPax, baselineKpis?.delayedPax),
    },
    {
      label: 'Crew Duty Breaches',
      value: String(kpis.crewDutyBreaches),
      color: colorClass(kpis.crewDutyBreaches, [0, 0, 1]),
      delta: deltaStr(kpis.crewDutyBreaches, baselineKpis?.crewDutyBreaches),
    },
  ];

  return (
    <div className="kpi-grid" role="region" aria-label="Key performance indicators" aria-live="polite">
      {cards.map((c) => (
        <div className="kpi-card" key={c.label}>
          <span className="kpi-label">{c.label}</span>
          <span className={`kpi-value ${c.color}`}>{c.value}</span>
          {c.delta && <span className={`kpi-delta ${c.delta.cls}`}>{c.delta.text}</span>}
        </div>
      ))}
    </div>
  );
}
