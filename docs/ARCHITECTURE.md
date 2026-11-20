# Domino Sky — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  React 19 + Vite + TypeScript                               │
│  ┌────────────┬──────────┬──────────┬──────────┬──────────┐ │
│  │ ControlBar │ KpiCards │ FlightsT │ GanttCh  │ Network  │ │
│  │            │          │ able     │ art      │ Map      │ │
│  ├────────────┴──────────┴──────────┴──────────┴──────────┤ │
│  │ ConnectionsTable │ RecoveryPanel (AI + Before/After)   │ │
│  └────────────────────────────────────────────────────────┘ │
│               ▲                                             │
│               │ fetch /api/v1/*                             │
└───────────────┼─────────────────────────────────────────────┘
                │
┌───────────────┼─────────────────────────────────────────────┐
│               ▼         API SERVER                          │
│  Express 5 + TypeScript                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Security: Helmet, CORS, Rate Limiting, Input Validation│ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Routes:                                                │ │
│  │  GET  /api/v1/network     → static dataset             │ │
│  │  POST /api/v1/simulate    → engine.simulate()          │ │
│  │  POST /api/v1/recover     → engine.recommendRecovery() │ │
│  │  POST /api/v1/recover/explain → AI + verification      │ │
│  │  GET  /api/health         → health check               │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ AI Pipeline: FactSheet → Groq/Gemini → verification   │ │
│  └────────────────────────────────────────────────────────┘ │
│               ▲                                             │
│               │ import                                      │
└───────────────┼─────────────────────────────────────────────┘
                │
┌───────────────┼─────────────────────────────────────────────┐
│               ▼     SIMULATION ENGINE                       │
│  Pure TypeScript, zero side effects                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ dataset.ts   │ Zod validation, normalisation, indices  │ │
│  │ simulate.ts  │ Deterministic cascade propagation       │ │
│  │ passengers.ts│ Connection evaluation, stranded pax     │ │
│  │ causal.ts    │ Root-cause causal chain builder         │ │
│  │ kpis.ts      │ KPI aggregation                        │ │
│  │ recovery.ts  │ Candidate generation, scoring, planning │ │
│  │ scenario.ts  │ Input validation, closure normalisation │ │
│  │ time.ts      │ Integer-minute arithmetic               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Package Structure

```
domino-sky/
├── packages/
│   └── engine/              # @domino/engine — pure simulation library
│       ├── src/
│       │   ├── time.ts      # Integer-minute time arithmetic
│       │   ├── schema.ts    # Zod schemas for official dataset + API inputs
│       │   ├── types.ts     # Domain types (Airport, Flight, Closure, etc.)
│       │   ├── dataset.ts   # Dataset loader with integrity checks
│       │   ├── simulate.ts  # Cascade propagation algorithm
│       │   ├── causal.ts    # Causal chain builder
│       │   ├── passengers.ts# Connection evaluation, stranded pax
│       │   ├── kpis.ts      # KPI computation
│       │   ├── recovery.ts  # Recovery candidate generation + optimiser
│       │   ├── scenario.ts  # Input validation
│       │   └── index.ts     # Public API barrel export
│       └── test/
│           ├── engine.test.ts  # tests: unit, golden, property, official
│           └── fixtures.ts     # Minimal test dataset
├── apps/
│   ├── server/              # @domino/server — Express API server
│   │   └── src/
│   │       ├── index.ts     # Entry point, security, static serving
│   │       ├── config.ts    # Zod-validated environment config
│   │       ├── data.ts      # Dataset file loader
│   │       ├── routes.ts    # REST API routes
│   │       ├── errors.ts    # Error handler (Zod, engine → 400)
│   │       └── ai/
│   │           ├── factSheet.ts  # Fact sheet builder
│   │           ├── dispatcher.ts # Groq/Gemini selection, verification and fallback
│   │           ├── verifier.ts   # Grounding verifier
│   │           └── fallback.ts   # Deterministic template fallback
│   └── web/                 # @domino/web — React frontend
│       └── src/
│           ├── main.tsx     # Entry point
│           ├── App.tsx      # Root component, state management
│           ├── api.ts       # API client with types
│           ├── utils.ts     # Time formatting, status classes
│           ├── index.css    # Design system (CSS variables, components)
│           └── components/
│               ├── ControlBar.tsx       # Airport picker, time, presets
│               ├── KpiCards.tsx          # Dashboard KPI grid
│               ├── FlightsTable.tsx     # Sortable, filterable, with causal chains
│               ├── GanttChart.tsx       # Aircraft utilisation timeline
│               ├── NetworkMap.tsx       # SVG India map with flight arcs
│               ├── ConnectionsTable.tsx # Passenger connection status
│               └── RecoveryPanel.tsx    # AI recommendation + before/after
├── data/
│   └── dataset.json         # Official organiser dataset (70 flights)
├── docs/
│   ├── SIMULATION_RULES.md  # Every propagation rule with worked examples
│   ├── AI_GROUNDING.md      # Fact sheet → verification pipeline
│   └── ARCHITECTURE.md      # This file
└── scripts/
    └── debug-scenario.ts    # Debug tool for testing closure scenarios
```

## Key Design Decisions

### 1. Engine as a Pure Library
The simulation engine has **zero side effects**: no I/O, no randomness, no mutation. Given the same inputs, it always produces the same outputs. This makes it trivially testable and auditable.

### 2. Integer-Minute Time Model
All times are integer minutes since midnight. This eliminates floating-point rounding errors and makes time arithmetic simple and correct.

### 3. Single-Pass Processing
Flights are processed once in `(scheduledDep, flightId)` order. Each flight's departure time is computed from its constraints (aircraft ready, crew ready, closures, holds) and committed. Candidate scoring skips detailed causal chains. The full simulation traces predecessor links when a caller needs flight explanations.

### 4. AI Never Computes
The AI receives a pre-computed fact sheet and must only select from pre-scored options. The grounding verifier rejects any response containing numbers not in the fact sheet. If the AI fails, a deterministic template provides the same information.

### 5. Monorepo with npm Workspaces
Using npm workspaces, the engine package is shared between the server (which calls it directly) and the frontend (which receives its types via the API). This ensures type consistency without code duplication.

## Security

- **Helmet**: HTTP security headers (CSP, HSTS, etc.)
- **CORS**: Restricted to configured origins
- **Rate limiting**: 120 req/min for API, 15 req/min for AI endpoint
- **Input validation**: All inputs validated with Zod before reaching the engine
- **No secret exposure**: API keys read from env, never logged or sent to client
- **JSON body limit**: 32KB to prevent memory exhaustion

