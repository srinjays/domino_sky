import { useState } from 'react';
import type { NetworkData } from '../api.js';

interface ClosureInput {
  airport: string;
  start: string;
  end: string;
}

interface Props {
  network: NetworkData;
  onRun: (closures: ClosureInput[]) => void;
  onReset: () => void;
  loading: boolean;
  hasResult: boolean;
}

const PRESETS = [
  { label: '🌧️ Mumbai 08:00–09:30', airport: 'BOM', start: '08:00', end: '09:30' },
  { label: '⛈️ Delhi 10:00–11:30', airport: 'DEL', start: '10:00', end: '11:30' },
  { label: '🌪️ Bengaluru 07:00–08:00', airport: 'BLR', start: '07:00', end: '08:00' },
  { label: '☁️ Chennai 12:00–13:30', airport: 'MAA', start: '12:00', end: '13:30' },
  { label: '🌩️ Kolkata 09:00–10:30', airport: 'CCU', start: '09:00', end: '10:30' },
  { label: '🌧️ Hyderabad 11:00–12:00', airport: 'HYD', start: '11:00', end: '12:00' },
];

export default function ControlBar({ network, onRun, onReset, loading, hasResult }: Props) {
  const [airport, setAirport] = useState('BOM');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('09:30');

  const handleRun = () => {
    onRun([{ airport, start, end }]);
  };

  const handlePreset = (p: typeof PRESETS[number]) => {
    setAirport(p.airport);
    setStart(p.start);
    setEnd(p.end);
    onRun([{ airport: p.airport, start: p.start, end: p.end }]);
  };

  const sorted = [...network.airports].sort((a, b) => a.city.localeCompare(b.city));

  return (
    <div className="control-bar" role="form" aria-label="Disruption scenario">
      <div className="control-group">
        <label className="control-label" htmlFor="airport-select">Airport</label>
        <select
          id="airport-select"
          value={airport}
          onChange={(e) => setAirport(e.target.value)}
          aria-label="Select airport to close"
        >
          {sorted.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} — {a.city}
            </option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <label className="control-label" htmlFor="start-time">Closure Start</label>
        <input
          id="start-time"
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="Closure start time"
        />
      </div>

      <div className="control-group">
        <label className="control-label" htmlFor="end-time">Closure End</label>
        <input
          id="end-time"
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="Closure end time"
        />
      </div>

      <button
        className="btn btn-primary"
        onClick={handleRun}
        disabled={loading || !airport || !start || !end || start >= end}
        aria-label="Run simulation"
      >
        {loading ? (
          <><span className="spinner" style={{ width: 14, height: 14 }} /> Simulating…</>
        ) : (
          <>▶ Simulate</>
        )}
      </button>

      {hasResult && (
        <button className="btn btn-secondary" onClick={onReset} disabled={loading} aria-label="Reset simulation">
          ✕ Reset
        </button>
      )}

      <div style={{ flex: 1 }} />

      <div className="control-group">
        <span className="control-label">Quick Presets</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="preset-btn"
              onClick={() => handlePreset(p)}
              disabled={loading}
              title={`Close ${p.airport} from ${p.start} to ${p.end}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

