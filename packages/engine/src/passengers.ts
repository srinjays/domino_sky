/**
 * Passenger impact. Model: every passenger is either *local* (one flight) or
 * *connecting* (exactly two flights linked by a Connection record). A
 * connection is broken if either leg is cancelled or if the actual
 * connection time is below the minimum connection time (MCT).
 *
 * Stranded passengers (counted once each, never double counted):
 *   - local passengers of cancelled flights
 *   - connecting passengers whose connection is broken (missed or a leg cancelled)
 */
import type { ConnectionOutcome, Dataset, FlightOutcome } from './types.js';

type OutcomeLike = Pick<FlightOutcome, 'status' | 'actualDep' | 'actualArr'>;

export function evaluateConnections(
  dataset: Dataset,
  outcomes: ReadonlyMap<string, OutcomeLike>,
): ConnectionOutcome[] {
  return dataset.connections
    .map((c): ConnectionOutcome => {
      const inF = dataset.index.flight.get(c.inboundFlightId)!;
      const outF = dataset.index.flight.get(c.outboundFlightId)!;
      const inO = outcomes.get(c.inboundFlightId);
      const outO = outcomes.get(c.outboundFlightId);
      const scheduledConnectMin = outF.schedDep - inF.schedArr;
      const base = {
        connectionId: c.id,
        inboundFlightId: c.inboundFlightId,
        outboundFlightId: c.outboundFlightId,
        airport: inF.destination,
        pax: c.pax,
        minConnectMin: c.minConnectMin,
        scheduledConnectMin,
      };
      if (
        !inO ||
        !outO ||
        inO.status === 'CANCELLED' ||
        outO.status === 'CANCELLED' ||
        inO.actualArr === null ||
        outO.actualDep === null
      ) {
        return { ...base, actualConnectMin: null, status: 'CANCELLED_LEG' };
      }
      const actualConnectMin = outO.actualDep - inO.actualArr;
      return {
        ...base,
        actualConnectMin,
        status: actualConnectMin >= c.minConnectMin ? 'MADE' : 'MISSED',
      };
    })
    .sort((a, b) => (a.connectionId < b.connectionId ? -1 : a.connectionId > b.connectionId ? 1 : 0));
}

export interface StrandedBreakdown {
  local: number;
  missedConnection: number;
  cancelledConnection: number;
  total: number;
}

export function strandedPassengers(
  dataset: Dataset,
  flights: readonly Pick<FlightOutcome, 'flightId' | 'status'>[],
  connections: readonly ConnectionOutcome[],
): StrandedBreakdown {
  const connectingOnFlight = new Map<string, number>();
  for (const c of dataset.connections) {
    connectingOnFlight.set(c.inboundFlightId, (connectingOnFlight.get(c.inboundFlightId) ?? 0) + c.pax);
    connectingOnFlight.set(c.outboundFlightId, (connectingOnFlight.get(c.outboundFlightId) ?? 0) + c.pax);
  }
  let local = 0;
  for (const f of flights) {
    if (f.status !== 'CANCELLED') continue;
    const booked = dataset.index.flight.get(f.flightId)?.pax ?? 0;
    local += booked - (connectingOnFlight.get(f.flightId) ?? 0);
  }
  let missedConnection = 0;
  let cancelledConnection = 0;
  for (const c of connections) {
    if (c.status === 'MISSED') missedConnection += c.pax;
    if (c.status === 'CANCELLED_LEG') cancelledConnection += c.pax;
  }
  return { local, missedConnection, cancelledConnection, total: local + missedConnection + cancelledConnection };
}

