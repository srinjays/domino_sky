# Domino Sky — Simulation Rules

> Every number shown in the UI comes from deterministic code. The AI explains, the engine calculates.

## 1. Time Model

- All times are **integer minutes** since midnight (0 = 00:00, 1439 = 23:59).
- The operating day extends past midnight; times > 1440 represent the next day (displayed as `HH:MM+1`).
- Times in the dataset are stored as `HH:MM` strings and parsed to integer minutes at load time.

## 2. Airport Closures

A closure is a half-open interval `[start, end)` on a single airport. During a closure:

- **No departures** from the airport: any flight with `origin == closedAirport` and `scheduledDep ∈ [start, end)` is delayed to `end`.
- **No arrivals** at the airport: any flight whose `scheduledArr ∈ [start, end)` is ground-held at its origin so it arrives at `end`. The departure is pushed to `end - blockMinutes`.
- Multiple closures compose: the system iterates until a fixed point is reached.

### Worked Example

**Closure:** BOM closed 08:00–09:30 (480–570 minutes)

| Flight | Route | Sched Dep | Sched Arr | Block | Effect |
|--------|-------|-----------|-----------|-------|--------|
| DS0201 | DEL→BOM | 06:00 | 08:10 | 130m | Depart at 07:20 to arrive at reopening, 80 minutes late. |
| DS0501 | BOM→BLR | 08:15 | 10:00 | 105m | Depart at 09:30, arriving at 11:15, 75 minutes late. |

## 3. Aircraft Rotation & Turnaround

- Each aircraft flies a **rotation**: a sequence of flights sorted by `leg_order`.
- After each flight lands, the aircraft needs a **turnaround** before the next flight can depart.
- The engine uses the global minimum turnaround (30 minutes). Scheduled ground time beyond that minimum can absorb inbound delays.
- **Constraint:** `nextDep ≥ prevArr + turnaroundMin`

### Cascade Propagation

When a flight arrives late, the turnaround pushes the next flight's departure. This can cascade through the entire rotation:

```
DS0201 arrives at BOM at 09:30 (80 minutes late).
DS0202 can depart at 10:00 after the 30-minute turnaround (40 minutes late).
It arrives at PNQ at 10:40. DS0203 can still depart at its scheduled 11:15.
```

## 4. Crew Duty Limits

- Each crew has an explicit `duty_start` time (from the dataset, not derived).
- **Duty duration** = `lastActualArrival - dutyStart`
- Must not exceed `max_duty_mins` (600 minutes = 10 hours for all crews).
- If a delay pushes the last arrival beyond the duty limit, **the flight is cancelled**.
- Cancelled flights cause the aircraft to be **out of position**, potentially cancelling subsequent flights in the rotation.

## 5. Passenger Connections

- A connection links two flights (inbound → outbound) at a hub airport.
- **Minimum Connection Time (MCT):** specified per connection as `min_connect_minutes`.
- A connection is **MADE** if: `outboundActualDep - inboundActualArr ≥ MCT`
- A connection is **MISSED** if the gap is less than MCT.
- A connection has status **CANCELLED_LEG** if either the inbound or outbound flight is cancelled.
- **Stranded passengers** include local passengers on cancelled flights and connecting passengers on broken connections. Each passenger is counted once.

## 6. Knock-on Flights

A flight is counted as "knock-on" if it is disrupted (delayed or cancelled) but **neither its origin nor destination** is a closed airport. These represent the cascade effect spreading to airports with clear skies.

## 7. Flight Processing Order

Flights are processed in `(scheduledDep, flightId)` order. This is a single-pass deterministic algorithm — given the same inputs, the output is always identical.

## 8. Recovery Actions

The recovery optimiser generates candidate actions:

| Action | Description |
|--------|------------|
| `CANCEL` | Cancel one flight (or a round-trip pair) to free the aircraft for later rotations |
| `SWAP_SPARE` | Replace a disrupted aircraft with a spare aircraft and standby crew |
| `HOLD` | Hold a flight's departure to protect a passenger connection (max 60 minutes) |

### Scoring Function

Each state is scored with a weighted objective (lower is better):

```
score = W_pax × strandedPax + W_delay × totalDelayMin + W_cancel × cancelledFlights
```

Default weights: `W_pax = 10`, `W_delay = 1`, `W_cancel = 100`.

### Greedy Multi-Step Plan

1. Evaluate all candidates against the disrupted baseline.
2. Apply the best-scoring action.
3. Re-evaluate remaining candidates on top of the new state.
4. Repeat up to 3 steps while the score keeps improving.

## 9. AI Grounding Pipeline

```
Engine computes SimulationResult
    ↓
Build FactSheet (all numbers from engine)
    ↓
Ask Gemini for one candidate ID
    ↓
Validate the ID and render its engine-computed metrics
    ↓
If selection fails → retry once → deterministic selection
```

Both paths use the selected option’s engine-computed figures.

