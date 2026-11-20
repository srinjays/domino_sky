# ✈️ Domino Sky

**Flight Disruption Cascade & Recovery Simulator**

> Close any airport and watch the delay domino spread across India's flight network. See which flights are late, *why* they're late, and how many passengers are stranded. Then let the AI dispatcher recommend recovery actions and compare before vs. after.

## 🎯 What It Does

A 90-minute thunderstorm in Mumbai can cancel a flight from Bengaluru to Kolkata five hours later. Each aircraft flies a chain of flights through the day — when one plane is held, every later flight on its chain starts late, even in cities with clear skies.

**Domino Sky** makes this cascade visible:

1. **Close** any of 16 Indian airports for a chosen duration
2. **Watch** delays propagate through 70 flights, 16 aircraft, and 21 passenger connections
3. **See** exactly *why* each flight is late (causal chain tracing back to the root closure)
4. **Get** an AI-powered recovery recommendation, grounded in engine-computed numbers
5. **Compare** before and after recovery with side-by-side KPI comparison

## ⚡ Quick Start

```bash
# 1. Install dependencies (Node 22.12+ in the 22.x line, or Node 24)
npm ci

# 2. Start the API server (port 8080)
npm run -w @domino/server dev

# 3. In another terminal, start the frontend (port 5173)
npm run -w @domino/web dev

# 4. Open http://localhost:5173
```

**Optional:** Set `GEMINI_API_KEY` in `.env` for AI-powered recommendations:
```bash
cp .env.example .env
# Edit .env and add your Gemini API key
```

The app works fully without an API key — it uses a deterministic fallback template.

## 🧪 Testing

```bash
# Run engine, API and grounding tests
npx vitest run

# Build both workspaces, then serve the production dashboard on port 8080
npm run build
npm start

# Browser regression tests against the production build
npx playwright install chromium
npm run test:e2e

# Run with coverage
npx vitest run --coverage

# Type-check everything
npx tsc -p packages/engine --noEmit
npx tsc -p apps/server --noEmit
npx tsc -p apps/web --noEmit
```

## 🏗️ Architecture

```
packages/engine/   Pure deterministic simulation library (zero I/O)
apps/server/       Express API with AI grounding pipeline
apps/web/          React dashboard with Gantt chart, network map, causal chains
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram.

## 📋 Feature → Requirement Mapping

| Requirement | Implementation |
|-------------|---------------|
| Close any airport for a chosen time | `ControlBar` with airport picker + time inputs + presets |
| Watch delay spread across the network | `NetworkMap` (SVG), `GanttChart`, `FlightsTable` with real-time cascade |
| Show which flights are late | `FlightsTable` with status badges, sortable by delay |
| Show *why* they are late | "Why?" button expands causal chain to root cause |
| Show stranded passengers | `KpiCards` (stranded pax) + `ConnectionsTable` (MISSED/MADE) |
| AI recovery recommendations | `RecoveryPanel` with Gemini or deterministic fallback |
| Before and after comparison | Side-by-side KPI comparison in `RecoveryPanel` |
| Deterministic calculations | All math in `@domino/engine`, tested with property-based tests |
| AI grounding verification | Model selects a candidate ID; the server renders its engine-computed metrics |

## 🔒 Security

- **Helmet** HTTP security headers (CSP, HSTS, X-Frame-Options)
- **CORS** restricted to configured origins
- **Rate limiting** (120 req/min API, 15 req/min AI)
- **Zod validation** on all inputs before reaching the engine
- **API keys** read from environment only, never logged or sent to client
- **32KB body limit** to prevent memory exhaustion
- **Non-root Docker user** for container security

## 📊 Dataset

The official organiser dataset (`flight_network.json`) contains:

| Entity | Count |
|--------|-------|
| Airports | 16 (DEL, BOM, BLR, HYD, MAA, CCU, COK, GOI, AMD, PNQ, JAI, LKO, GAU, IXC, BBI, TRV) |
| Flights | 70 |
| Aircraft | 16 (VT-DS01 through VT-DS16) |
| Connections | 21 (at hub airports) |
| Crews | 16 (one per aircraft, 10h max duty) |
| Spare Aircraft | 2 (VT-DS17 at BLR, VT-DS18 at DEL) |

## 📝 Documentation

- [SIMULATION_RULES.md](docs/SIMULATION_RULES.md) — Every propagation rule with worked examples
- [AI_GROUNDING.md](docs/AI_GROUNDING.md) — The fact sheet → verification → fallback pipeline
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture and design decisions

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.8 (strict) |
| Frontend | React 19 + Vite 6 |
| Backend | Express 5 |
| Validation | Zod |
| AI | Gemini 2.5 Flash (optional) |
| Testing | Vitest + fast-check (property-based) |
| Security | Helmet, express-rate-limit, CORS |

## License

MIT

