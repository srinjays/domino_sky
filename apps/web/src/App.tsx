import { useState, useRef, useEffect, useCallback } from 'react';
import type { NetworkData, SimulationResult, ExplainResult } from './api.js';
import { fetchNetwork, runSimulation, runRecovery } from './api.js';
import ControlBar from './components/ControlBar.js';
import KpiCards from './components/KpiCards.js';
import FlightsTable from './components/FlightsTable.js';
import GanttChart from './components/GanttChart.js';
import NetworkMap from './components/NetworkMap.js';
import ConnectionsTable from './components/ConnectionsTable.js';
import RecoveryPanel from './components/RecoveryPanel.js';

const tabs = ['flights', 'gantt', 'connections'] as const;
type Tab = typeof tabs[number];

export default function App() {
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('flights');

  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  // Load network on mount
  useEffect(() => {
    fetchNetwork()
      .then(setNetwork)
      .catch((e) => setError(`Failed to load network: ${e.message}`));
  }, []);

  const handleRun = useCallback(
    async (closures: { airport: string; start: string; end: string }[]) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const { signal } = controller;
      setRecLoading(false);
      setError(null);
      setLoading(true);
      setSimResult(null);
      setExplainResult(null);
      try {
        const result = await runSimulation(closures, signal);
        if (signal.aborted) return;
        setSimResult(result);
        setLoading(false);
        setRecLoading(true);
        try {
          const recovery = await runRecovery(closures, signal);
          if (!signal.aborted) setExplainResult(recovery);
        } catch {
          if (!signal.aborted) setError('Recovery recommendations are unavailable. You can still explore this simulation.');
        }
      } catch (e: unknown) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : 'Simulation failed');
      } finally {
        if (!signal.aborted) { setLoading(false); setRecLoading(false); }
      }
    },
    [],
  );

  const handleReset = useCallback(() => {
    pending.current?.abort();
    setRecLoading(false);
    setLoading(false);
    setSimResult(null);
    setExplainResult(null);
    setError(null);
  }, []);

  if (!network) {
    return (
      <div className="app-layout">
        <header className="app-header">
          <div className="app-logo">
            <LogoIcon />
            Domino Sky
          </div>
        </header>
        <main id="main-content" className="app-main">
          {error ? (
            <div className="card" style={{ borderColor: 'var(--red)' }}>
              <p role="alert" style={{ color: 'var(--red)' }}>❌ {error}</p>
            </div>
          ) : (
            <div className="loading"><span className="spinner" /> Loading flight network…</div>
          )}
        </main>
      </div>
    );
  }

  const closedAirport = simResult?.closures[0]?.airport;

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="app-header">
        <div className="app-logo">
          <LogoIcon />
          Domino Sky
          <span>Flight Disruption Cascade & Recovery Simulator</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>{network.airports.length} airports</span>
          <span>·</span>
          <span>{network.flights.length} flights</span>
          <span>·</span>
          <span>{network.aircraft.length} aircraft</span>
        </div>
      </header>

      <main id="main-content" className="app-main">
        {error && (
          <div className="card" style={{ borderColor: 'var(--red)', padding: 'var(--space-md)' }}>
            <p role="alert" style={{ color: 'var(--red)' }}>❌ {error}</p>
          </div>
        )}

        <ControlBar
          network={network}
          onRun={handleRun}
          onReset={handleReset}
          loading={loading}
          hasResult={!!simResult}
        />

        {!simResult && !loading && (
          <div className="hero">
            <h2>Close an airport and watch the cascade unfold</h2>
            <p>
              Select an airport and a closure window above, or use a quick preset.
              The simulator will propagate delays through aircraft rotations,
              passenger connections, and crew duty limits.
            </p>
          </div>
        )}

        {loading && (
          <div className="loading"><span className="spinner" /> Running simulation…</div>
        )}

        {simResult && (
          <div className="fade-in">
            {/* Closure summary */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {simResult.closures.map((c, i) => (
                <span key={i} className="badge badge-cancelled" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                  ⛈️ {c.airport} closed {minutesToTime(c.start)}–{minutesToTime(c.end)} ({c.end - c.start}min)
                </span>
              ))}
            </div>

            {/* KPIs */}
            <KpiCards kpis={simResult.kpis} />

            {/* Map + Recovery side by side */}
            <div className="section-grid">
              <NetworkMap
                flights={simResult.flights}
                network={network}
                closedAirport={closedAirport}
              />
              {recLoading && <p role="status" className="card">Preparing recovery recommendation…</p>}
              {explainResult && (
                <RecoveryPanel
                  result={explainResult}
                  baselineKpis={simResult.kpis}
                />
              )}
            </div>

            {/* Tabs: Flights, Gantt, Connections */}
            <div className="section-tabs" role="tablist" aria-label="Simulation details">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  role="tab"
                  id={`tab-${tab}`}
                  aria-controls={`panel-${tab}`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onKeyDown={(event) => {
                    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
                    if (next === undefined) return;
                    event.preventDefault();
                    const target = tabs[next]!;
                    setActiveTab(target);
                    document.getElementById(`tab-${target}`)?.focus();
                  }}
                  className={`section-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                  aria-selected={activeTab === tab}
                >
                  {tab === 'flights' && `✈️ Flights (${simResult.flights.length})`}
                  {tab === 'gantt' && `📊 Gantt Chart`}
                  {tab === 'connections' && `🔗 Connections (${simResult.connections.length})`}
                </button>
              ))}
            </div>

            <div id="panel-flights" role="tabpanel" aria-labelledby="tab-flights" hidden={activeTab !== 'flights'}>{activeTab === 'flights' && <FlightsTable flights={simResult.flights} />}</div>
            <div id="panel-gantt" role="tabpanel" aria-labelledby="tab-gantt" hidden={activeTab !== 'gantt'}>{activeTab === 'gantt' && <GanttChart flights={simResult.flights} network={network} />}</div>
            <div id="panel-connections" role="tabpanel" aria-labelledby="tab-connections" hidden={activeTab !== 'connections'}>{activeTab === 'connections' && <ConnectionsTable connections={simResult.connections} />}</div>
          </div>
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: 'var(--space-md)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: '0.75rem',
      }}>
        Domino Sky · Deterministic Simulation Engine · AI Grounding Verifier · Built for PromptWars
      </footer>
    </div>
  );
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function LogoIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" width={28} height={28}>
      <rect width="64" height="64" rx="12" fill="#1e293b" />
      <path d="M12 42 L32 18 L52 42" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="42" r="3" fill="#f97316" />
      <circle cx="32" cy="18" r="3" fill="#22c55e" />
      <circle cx="52" cy="42" r="3" fill="#f97316" />
      <path d="M20 46 L44 46" stroke="#64748b" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

