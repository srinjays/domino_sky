import { useState } from 'react';
import type { ExplainResult, SimulationKpis } from '../api.js';
import { fmtNum, formatDuration } from '../utils.js';

interface Props {
  result: ExplainResult;
  baselineKpis: SimulationKpis;
}

function RecoveryMetrics({
  phase,
  kpis,
  score,
}: {
  phase: 'before' | 'after';
  kpis: SimulationKpis;
  score: number | undefined;
}) {
  const title = phase === 'before' ? 'Before Recovery' : 'After Recovery';
  const rows = [
    ['Delayed Flights', kpis.delayedFlights],
    ['Cancelled', kpis.cancelledFlights],
    ['Total Delay', formatDuration(kpis.totalDelayMin)],
    ['Stranded Passengers', fmtNum(kpis.strandedPax)],
    ['Broken Connections', kpis.brokenConnections],
    ['Score', score == null ? 'Unavailable' : fmtNum(score)],
  ] as const;
  return (
    <section aria-label={title} className={`before-after-col ${phase}`}>
      <h4 className="before-after-title">{title}</h4>
      <dl>
        {rows.map(([label, value]) => (
          <div className="before-after-row" key={label}>
            <dt className="before-after-label">{label}</dt>
            <dd className="before-after-value">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function RecoveryPanel({ result, baselineKpis }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const { recommendation, report } = result;

  const selected = result.recommended;
  const selectedScore =
    selected?.score ??
    (selected?.optionId === 'PLAN'
      ? report.plan.score
      : report.candidates.find((candidate) => candidate.id === selected?.optionId)?.score);
  const afterKpis = selected?.result.kpis ?? baselineKpis;
  const alternatives = report.candidates.filter((c) => c.id !== selected?.optionId);

  return (
    <div className="card recovery-panel fade-in">
      <div className="card-header">
        <h3 className="card-title">
          <span className="icon">🤖</span> AI Recovery Recommendation
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {recommendation.isAiFallback ? (
            <span className="badge badge-fallback">Deterministic Fallback</span>
          ) : (
            <span className="badge badge-ai">{recommendation.provider === 'groq' ? 'Groq' : 'Gemini'} AI</span>
          )}
          {recommendation.fallbackReason && (
            <span className="badge badge-missed" title={recommendation.fallbackReason}>
              ⚠ Fallback
            </span>
          )}
          {recommendation.verification.passed && (
            <span className="badge badge-verified">Engine values checked</span>
          )}
          {!recommendation.verification.passed && (
            <span
              className="badge badge-missed"
              title={recommendation.verification.errors.join('; ')}
            >
              ✗ Verification failed
            </span>
          )}
        </div>
      </div>

      <>
        <Rationale text={recommendation.rationale} />

        {recommendation.tradeoffs.length > 0 && (
          <ul className="tradeoff-list">
            {recommendation.tradeoffs.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}

        {/* Before / After comparison */}
        {selected && (
          <div className="before-after">
            <RecoveryMetrics phase="before" kpis={baselineKpis} score={report.baseline.score} />
            <RecoveryMetrics phase="after" kpis={afterKpis} score={selectedScore} />
          </div>
        )}

        {/* Candidates list */}
        {alternatives.length > 0 && (
          <>
            <button
              className="btn btn-sm btn-secondary"
              style={{ marginTop: 'var(--space-md)' }}
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
            >
              {showDetails ? '▾ Hide alternatives' : `▸ Show ${alternatives.length} alternatives`}
            </button>
            {showDetails && (
              <div className="table-wrap" style={{ marginTop: 'var(--space-sm)' }}>
                <table aria-label="Recovery candidates">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Action</th>
                      <th>Score</th>
                      <th>Improvement</th>
                      <th>Stranded Δ</th>
                      <th>Delay Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alternatives.map((c, i) => (
                      <tr key={c.id}>
                        <td>{i + 1}</td>
                        <td style={{ maxWidth: 300 }}>{c.description}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtNum(c.score)}</td>
                        <td
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: c.improvement > 0 ? 'var(--green)' : 'var(--red)',
                          }}
                        >
                          {c.improvement > 0 ? '-' : '+'}
                          {Math.abs(c.improvement)}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color:
                              (c.delta.strandedPax ?? 0) < 0
                                ? 'var(--green)'
                                : (c.delta.strandedPax ?? 0) > 0
                                  ? 'var(--red)'
                                  : undefined,
                          }}
                        >
                          {(c.delta.strandedPax ?? 0) < 0 ? '' : '+'}
                          {c.delta.strandedPax ?? 0}
                        </td>
                        <td
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color:
                              (c.delta.totalDelayMin ?? 0) < 0
                                ? 'var(--green)'
                                : (c.delta.totalDelayMin ?? 0) > 0
                                  ? 'var(--red)'
                                  : undefined,
                          }}
                        >
                          {(c.delta.totalDelayMin ?? 0) < 0 ? '' : '+'}
                          {c.delta.totalDelayMin ?? 0}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {report.evaluatedCount > 0 && (
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-sm)',
            }}
          >
            Evaluated {report.evaluatedCount} candidate actions · {report.improvingCount} improving
            · Weights: {report.weights.strandedPax}×pax + {report.weights.delayMin}×delay +{' '}
            {report.weights.cancellation}×cancellation
          </p>
        )}
      </>
    </div>
  );
}

/** Render the headings and bullet lists emitted by the server as React text nodes. */
function Rationale({ text }: { text: string }) {
  return (
    <div className="recovery-rationale">
      {text.split(/\n{2,}/).map((block, index) => {
        const [heading = '', ...lines] = block.split('\n');
        const label = /^\*\*(.+?)\*\*(.*)$/.exec(heading);
        const bullets = lines.filter((line) => line.startsWith('- '));
        return (
          <div key={index}>
            <p>
              {label ? (
                <>
                  <strong>{label[1]}</strong>
                  {label[2]}
                </>
              ) : (
                heading
              )}
            </p>
            {lines
              .filter((line) => !line.startsWith('- '))
              .map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            {bullets.length > 0 && (
              <ul>
                {bullets.map((line, i) => (
                  <li key={i}>{line.slice(2)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
