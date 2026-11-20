import { useState, useMemo, Fragment } from 'react';
import type { FlightOutcome } from '../api.js';
import { formatClock, statusClass, causeLabel, cancelLabel } from '../utils.js';

interface Props {
  flights: FlightOutcome[];
}

type SortKey = 'flightId' | 'origin' | 'destination' | 'schedDep' | 'status' | 'delayMin' | 'aircraftId';
type StatusFilter = 'ALL' | 'DELAYED' | 'CANCELLED' | 'ON_TIME';

export default function FlightsTable({ flights }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('schedDep');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = flights;
    if (filter !== 'ALL') list = list.filter((f) => f.status === filter);
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'flightId': cmp = a.flightId.localeCompare(b.flightId); break;
        case 'origin': cmp = a.origin.localeCompare(b.origin); break;
        case 'destination': cmp = a.destination.localeCompare(b.destination); break;
        case 'schedDep': cmp = a.schedDep - b.schedDep; break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'delayMin': cmp = a.delayMin - b.delayMin; break;
        case 'aircraftId': cmp = a.aircraftId.localeCompare(b.aircraftId); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [flights, sortKey, sortAsc, filter]);

  const counts = useMemo(() => {
    const c = { DELAYED: 0, CANCELLED: 0, ON_TIME: 0 };
    for (const f of flights) c[f.status]++;
    return c;
  }, [flights]);

  const th = (key: SortKey, label: string) => (
    <th
      className={sortKey === key ? 'sorted' : ''}
      aria-sort={sortKey === key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
    >
      <button className="sort-button" onClick={() => toggleSort(key)}>{label} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}</button>
    </th>
  );

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title"><span className="icon">✈️</span> Flights ({filtered.length})</h3>
        <div className="filter-bar">
          {(['ALL', 'DELAYED', 'CANCELLED', 'ON_TIME'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              className={`filter-chip ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'ALL' ? `All (${flights.length})` : `${s.replace('_', ' ')} (${counts[s]})`}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table aria-label="Flight outcomes">
          <thead>
            <tr>
              {th('flightId', 'Flight')}
              {th('aircraftId', 'Aircraft')}
              {th('origin', 'Origin')}
              {th('destination', 'Dest')}
              {th('schedDep', 'Sched Dep')}
              <th>Actual Dep</th>
              <th>Sched Arr</th>
              <th>Actual Arr</th>
              {th('status', 'Status')}
              {th('delayMin', 'Delay')}
              <th>Pax</th>
              <th>Cause</th>
              <th>Why?</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <Fragment key={f.flightId}>
                <tr>
                  <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{f.flightId}</strong></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{f.aircraftId}</td>
                  <td>{f.origin}</td>
                  <td>{f.destination}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{formatClock(f.schedDep)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: f.delayMin > 0 ? 'var(--orange)' : undefined }}>
                    {f.actualDep !== null ? formatClock(f.actualDep) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{formatClock(f.schedArr)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: f.delayMin > 0 ? 'var(--orange)' : undefined }}>
                    {f.actualArr !== null ? formatClock(f.actualArr) : '—'}
                  </td>
                  <td><span className={`badge ${statusClass(f.status)}`}>{f.status.replace('_', ' ')}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: f.delayMin > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                    {f.status === 'CANCELLED' ? '—' : (f.delayMin > 0 ? `+${f.delayMin}m` : '0m')}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{f.pax}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.status === 'CANCELLED' ? cancelLabel(f.cancelReason) : causeLabel(f.cause)}
                  </td>
                  <td>
                    {f.status !== 'ON_TIME' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => toggleExpand(f.flightId)}
                        aria-expanded={expanded.has(f.flightId)}
                        aria-label={`Show causal chain for ${f.flightId}`}
                      >
                        {expanded.has(f.flightId) ? '▾ Hide' : '▸ Why?'}
                      </button>
                    )}
                  </td>
                </tr>
                  {expanded.has(f.flightId) && (
                  <tr key={`${f.flightId}-chain`}>
                    <td colSpan={13} style={{ padding: '8px 16px', background: 'var(--bg-primary)' }}>
                      <CausalChainView chain={f.chain} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="empty-state">
                  <p>No flights match the current filter.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CausalChainView({ chain }: { chain: FlightOutcome['chain'] }) {
  return (
    <div className="causal-chain">
      {chain.root.kind === 'CLOSURE' && (
        <span className="causal-link causal-root">
          ⛈️ {chain.root.airport} closed {formatClock(chain.root.start)}–{formatClock(chain.root.end)}
        </span>
      )}
      {chain.root.kind === 'RECOVERY_ACTION' && (
        <span className="causal-link causal-root">🔧 {chain.root.description}</span>
      )}
      {chain.links.map((link, i) => (
        <span key={i}>
          <span className="causal-arrow"> → </span>
          <span className="causal-link">
            {link.flightId} ({link.status === 'CANCELLED' ? 'cancelled' : `+${link.delayMin}m`}): {link.reason}
          </span>
        </span>
      ))}
    </div>
  );
}

