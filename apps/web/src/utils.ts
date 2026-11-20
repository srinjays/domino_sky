/** Time formatting utilities for the frontend. */

/** Format integer minutes to HH:MM. */
export function formatClock(minutes: number): string {
  if (minutes < 0) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) {
    return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}+1`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format minutes as human-readable duration. */
export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m';
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** Convert HH:MM string to integer minutes. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Convert integer minutes to HH:MM input value. */
export function toTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Status → CSS class. */
export function statusClass(status: string): string {
  switch (status) {
    case 'ON_TIME': return 'badge-on-time';
    case 'DELAYED': return 'badge-delayed';
    case 'CANCELLED': return 'badge-cancelled';
    case 'MADE': return 'badge-made';
    case 'MISSED': return 'badge-missed';
    case 'CANCELLED_LEG': return 'badge-cancelled-leg';
    default: return '';
  }
}

/** Human-readable cause label. */
export function causeLabel(cause: { kind: string; [k: string]: unknown }): string {
  switch (cause.kind) {
    case 'NONE': return 'On time';
    case 'ORIGIN_CLOSURE': return `Origin closed (${cause.airport})`;
    case 'DEST_CLOSURE': return `Dest closed (${cause.airport})`;
    case 'LATE_INBOUND_AIRCRAFT': return `Late aircraft (from ${cause.flightId})`;
    case 'LATE_CREW': return `Late crew (${cause.crewId})`;
    case 'CONNECTION_HOLD': return `Held for connection`;
    case 'SPARE_AVAILABILITY': return `Spare aircraft (${cause.spareId})`;
    default: return cause.kind;
  }
}

/** Cancel reason label. */
export function cancelLabel(reason: { kind: string; [k: string]: unknown } | null): string {
  if (!reason) return '';
  switch (reason.kind) {
    case 'RECOVERY_CANCEL': return 'Cancelled by recovery';
    case 'CREW_DUTY_EXCEEDED': return `Crew ${reason.crewId} duty exceeded (${reason.dutyMin}/${reason.maxDutyMin} min)`;
    case 'AIRCRAFT_OUT_OF_POSITION': return `Aircraft ${reason.aircraftId} at ${reason.location}`;
    case 'CREW_OUT_OF_POSITION': return `Crew ${reason.crewId} at ${reason.location}`;
    default: return reason.kind;
  }
}

/** Number formatting with comma separators. */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-IN');
}

