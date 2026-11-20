/**
 * KPIs derived from simulation outcomes.
 */
import { uniquePassengerCount } from './dataset.js';
import { strandedPassengers } from './passengers.js';
import type { Closure, ConnectionOutcome, CrewOutcome, Dataset, FlightOutcome, Kpis } from './types.js';

export function computeKpis(
  dataset: Dataset,
  flights: readonly Omit<FlightOutcome, 'chain'>[],
  connections: readonly ConnectionOutcome[],
  crews: readonly CrewOutcome[],
  closures: readonly Closure[],
): Kpis {
  const closedAirports = new Set(closures.map((c) => c.airport));
  let operatedFlights = 0;
  let onTimeFlights = 0;
  let delayedFlights = 0;
  let cancelledFlights = 0;
  let totalDelayMin = 0;
  let maxDelayMin = 0;
  let knockOnFlights = 0;
  let delayedPax = 0;
  const aircraftAffected = new Set<string>();

  for (const f of flights) {
    const disrupted = f.status !== 'ON_TIME';
    if (f.status === 'CANCELLED') {
      cancelledFlights++;
    } else {
      operatedFlights++;
      totalDelayMin += f.delayMin;
      maxDelayMin = Math.max(maxDelayMin, f.delayMin);
      if (f.status === 'DELAYED') {
        delayedFlights++;
        delayedPax += f.pax;
      } else {
        onTimeFlights++;
      }
    }
    if (disrupted) {
      const scheduled = dataset.index.flight.get(f.flightId);
      if (scheduled) aircraftAffected.add(scheduled.aircraftId);
      if (!closedAirports.has(f.origin) && !closedAirports.has(f.destination)) knockOnFlights++;
    }
  }

  const stranded = strandedPassengers(dataset, flights, connections);
  return {
    totalFlights: flights.length,
    operatedFlights,
    onTimeFlights,
    delayedFlights,
    cancelledFlights,
    totalDelayMin,
    maxDelayMin,
    knockOnFlights,
    aircraftAffected: aircraftAffected.size,
    totalConnections: connections.length,
    brokenConnections: connections.filter((c) => c.status !== 'MADE').length,
    totalPassengers: uniquePassengerCount(dataset),
    strandedPax: stranded.total,
    strandedLocalPax: stranded.local,
    strandedMissedConnectionPax: stranded.missedConnection,
    strandedCancelledConnectionPax: stranded.cancelledConnection,
    delayedPax,
    crewDutyBreaches: crews.filter((c) => c.dutyExceeded).length,
  };
}
