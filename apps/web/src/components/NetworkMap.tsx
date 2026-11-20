import { useMemo } from 'react';
import type { FlightOutcome, NetworkData } from '../api.js';

interface Props {
  flights: FlightOutcome[];
  network: NetworkData;
  closedAirport?: string;
}

// India bounding box for SVG projection
const MIN_LAT = 8;
const MAX_LAT = 35;
const MIN_LNG = 68;
const MAX_LNG = 97;

const SVG_W = 600;
const SVG_H = 500;
const PAD = 40;

function project(lat: number, lng: number): [number, number] {
  const x = PAD + ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * (SVG_W - 2 * PAD);
  const y = PAD + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (SVG_H - 2 * PAD);
  return [x, y];
}

function statusColor(status: string): string {
  switch (status) {
    case 'ON_TIME': return '#22c55e';
    case 'DELAYED': return '#f97316';
    case 'CANCELLED': return '#ef4444';
    default: return '#64748b';
  }
}

export default function NetworkMap({ flights, network, closedAirport }: Props) {
  const airports = useMemo(() => {
    return network.airports.map((a) => ({
      ...a,
      pos: project(a.lat, a.lon),
    }));
  }, [network.airports]);

  const airportMap = useMemo(() => {
    const m = new Map<string, (typeof airports)[number]>();
    for (const a of airports) m.set(a.code, a);
    return m;
  }, [airports]);

  const arcs = useMemo(() => {
    return flights
      .filter((f) => f.status !== 'CANCELLED')
      .map((f) => {
        const from = airportMap.get(f.origin);
        const to = airportMap.get(f.destination);
        if (!from || !to) return null;
        return { f, from: from.pos, to: to.pos, color: statusColor(f.status) };
      })
      .filter(Boolean) as { f: FlightOutcome; from: [number, number]; to: [number, number]; color: string }[];
  }, [flights, airportMap]);

  // Aggregate: count disrupted flights per airport
  const disruptionCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const f of flights) {
      if (f.status !== 'ON_TIME') {
        c.set(f.origin, (c.get(f.origin) ?? 0) + 1);
        c.set(f.destination, (c.get(f.destination) ?? 0) + 1);
      }
    }
    return c;
  }, [flights]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title"><span className="icon">🗺️</span> Network Map</h3>
        <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem' }}>
          <span style={{ color: '#22c55e' }}>● On Time</span>
          <span style={{ color: '#f97316' }}>● Delayed</span>
          <span style={{ color: '#ef4444' }}>● Cancelled</span>
        </div>
      </div>
      <div className="network-map">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} aria-label="Flight network map of India">
          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="#0f172a" rx={8} />

          {/* Grid lines */}
          {[72, 77, 82, 87, 92].map((lng) => {
            const [x] = project(20, lng);
            return <line key={`lng-${lng}`} x1={x} y1={PAD} x2={x} y2={SVG_H - PAD} stroke="#1e293b" strokeWidth={1} />;
          })}
          {[10, 15, 20, 25, 30].map((lat) => {
            const [, y] = project(lat, 80);
            return <line key={`lat-${lat}`} x1={PAD} y1={y} x2={SVG_W - PAD} y2={y} stroke="#1e293b" strokeWidth={1} />;
          })}

          {/* Flight arcs */}
          {arcs.map(({ f, from, to, color }) => {
            const mx = (from[0] + to[0]) / 2;
            const my = (from[1] + to[1]) / 2 - 20;
            return (
              <path
                key={f.flightId}
                d={`M ${from[0]},${from[1]} Q ${mx},${my} ${to[0]},${to[1]}`}
                fill="none"
                stroke={color}
                strokeWidth={f.status === 'DELAYED' ? 1.5 : 0.8}
                opacity={f.status === 'ON_TIME' ? 0.3 : 0.7}
              >
                <title>{`${f.flightId}: ${f.origin}→${f.destination} (${f.status}${f.delayMin > 0 ? `, +${f.delayMin}m` : ''})`}</title>
              </path>
            );
          })}

          {/* Airport nodes */}
          {airports.map((a) => {
            const isClosed = a.code === closedAirport;
            const disruptions = disruptionCount.get(a.code) ?? 0;
            const r = isClosed ? 8 : (disruptions > 0 ? 5 + Math.min(disruptions, 10) * 0.5 : 4);
            const fill = isClosed ? '#ef4444' : (disruptions > 0 ? '#f97316' : '#38bdf8');

            return (
              <g key={a.code}>
                {isClosed && (
                  <circle cx={a.pos[0]} cy={a.pos[1]} r={14} fill="none" stroke="#ef4444" strokeWidth={2} opacity={0.4}>
                    <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={a.pos[0]}
                  cy={a.pos[1]}
                  r={r}
                  fill={fill}
                  stroke={isClosed ? '#ef4444' : '#1e293b'}
                  strokeWidth={1.5}
                  opacity={0.9}
                >
                  <title>{`${a.code} — ${a.city}${isClosed ? ' (CLOSED)' : ''}${disruptions > 0 ? ` (${disruptions} disrupted)` : ''}`}</title>
                </circle>
                <text
                  x={a.pos[0]}
                  y={a.pos[1] - r - 4}
                  textAnchor="middle"
                  fill={isClosed ? '#ef4444' : '#94a3b8'}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fontWeight={isClosed ? 700 : 500}
                >
                  {a.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

