import type { ConnectionOutcome } from '../api.js';
import { statusClass, formatDuration } from '../utils.js';

interface Props {
  connections: ConnectionOutcome[];
}

export default function ConnectionsTable({ connections }: Props) {
  const sorted = [...connections].sort((a, b) => {
    // Missed first, then cancelled, then made
    const rank = (s: string) => s === 'MISSED' ? 0 : s === 'CANCELLED_LEG' ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });

  const missed = connections.filter((c) => c.status === 'MISSED').length;
  const cancelledLeg = connections.filter((c) => c.status === 'CANCELLED_LEG').length;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <span className="icon">🔗</span> Connections ({connections.length})
          {missed > 0 && <span className="badge badge-missed" style={{ marginLeft: 8 }}>{missed} missed</span>}
          {cancelledLeg > 0 && <span className="badge badge-cancelled" style={{ marginLeft: 4 }}>{cancelledLeg} cancelled</span>}
        </h3>
      </div>
      <div className="table-wrap">
        <table aria-label="Passenger connections">
          <thead>
            <tr>
              <th>ID</th>
              <th>Airport</th>
              <th>From Flight</th>
              <th>To Flight</th>
              <th>Pax</th>
              <th>Min Connect</th>
              <th>Sched Gap</th>
              <th>Actual Gap</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.connectionId}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.connectionId}</td>
                <td>{c.airport}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{c.inboundFlightId}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{c.outboundFlightId}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{c.pax}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(c.minConnectMin)}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(c.scheduledConnectMin)}</td>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  color: c.actualConnectMin !== null && c.actualConnectMin < c.minConnectMin ? 'var(--red)' : undefined,
                }}>
                  {c.actualConnectMin !== null ? formatDuration(c.actualConnectMin) : '—'}
                </td>
                <td><span className={`badge ${statusClass(c.status)}`}>{c.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

