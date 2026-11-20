import { useState } from 'react';
import type { ExplainResult, SimulationKpis } from '../api.js';
import { fmtNum, formatDuration } from '../utils.js';

interface Props {
  result: ExplainResult;
  baselineKpis: SimulationKpis;
}

function KpiRow({ label, before, after }: { label: string; before: number | string; after: number | string }) {
  return (
    <div className="before-after-row">
      <span className="before-after-label">{label}</span>
      <span className="before-after-value">
        <span style={{ color: 'var(--red)', marginRight: 12 }}>{before}</span>
        →
        <span style={{ color: 'var(--green)', marginLeft: 12 }}>{after}</span>
      </span>
    </div>
  );
}

export default function RecoveryPanel({ result, baselineKpis }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const { recommendation, report } = result;

  const selected = result.recommended;
  const selectedScore = selected?.score ?? (selected?.optionId === 'PLAN'
    ? report.plan.score
    : report.candidates.find(candidate => candidate.id === selected?.optionId)?.score);
  const afterKpis = selected?.result.kpis ?? baselineKpis;
  const alternatives = report.candidates.filter(c => c.id !== selected?.optionId);

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
            <span className="badge badge-ai">Gemini AI</span>
          )}
          {recommendation.fallbackReason && (
            <span className="badge badge-missed" title={recommendation.fallbackReason}>⚠ Fallback</span>
          )}
          {recommendation.verification.passed && (
            <span className="badge badge-verified">Engine values checked</span>
          )}
          {!recommendation.verification.passed && (
            <span className="badge badge-missed" title={recommendation.verification.errors.join('; ')}>
              ✗ Verification failed
            </span>
          )}
        </div>
      </div>

      <>
          <div className="recovery-rationale" dangerouslySetInnerHTML={{ __html: markdownToHtml(recommendation.rationale) }} />

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
              <div className="before-after-col before">
                <div className="before-after-title">⚡ Before Recovery</div>
                <KpiRow label="Delayed Flights" before={baselineKpis.delayedFlights} after="" />
                <KpiRow label="Cancelled" before={baselineKpis.cancelledFlights} after="" />
                <KpiRow label="Total Delay" before={formatDuration(baselineKpis.totalDelayMin)} after="" />
                <KpiRow label="Stranded Pax" before={fmtNum(baselineKpis.strandedPax)} after="" />
                <KpiRow label="Broken Cx" before={baselineKpis.brokenConnections} after="" />
                <div className="before-after-row">
                  <span className="before-after-label">Score</span>
                  <span className="before-after-value" style={{ color: 'var(--red)' }}>{fmtNum(report.baseline.score)}</span>
                </div>
              </div>
              <div className="before-after-col after">
                <div className="before-after-title">✅ After Recovery</div>
                <KpiRow label="Delayed Flights" before="" after={afterKpis.delayedFlights} />
                <KpiRow label="Cancelled" before="" after={afterKpis.cancelledFlights} />
                <KpiRow label="Total Delay" before="" after={formatDuration(afterKpis.totalDelayMin)} />
                <KpiRow label="Stranded Pax" before="" after={fmtNum(afterKpis.strandedPax)} />
                <KpiRow label="Broken Cx" before="" after={afterKpis.brokenConnections} />
                <div className="before-after-row">
                  <span className="before-after-label">Score</span>
                  <span className="before-after-value" style={{ color: 'var(--green)' }}>{selectedScore == null ? 'Unavailable' : fmtNum(selectedScore)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Candidates list */}
          {alternatives.length > 0 && (
            <>
              <button
                className="btn btn-sm btn-secondary"
                style={{ marginTop: 'var(--space-md)' }}
                onClick={() => setShowDetails(!showDetails)}
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
                          <td style={{ fontFamily: 'var(--font-mono)', color: c.improvement > 0 ? 'var(--green)' : 'var(--red)' }}>
                            {c.improvement > 0 ? '-' : '+'}{Math.abs(c.improvement)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: (c.delta.strandedPax ?? 0) < 0 ? 'var(--green)' : (c.delta.strandedPax ?? 0) > 0 ? 'var(--red)' : undefined }}>
                            {(c.delta.strandedPax ?? 0) < 0 ? '' : '+'}{c.delta.strandedPax ?? 0}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: (c.delta.totalDelayMin ?? 0) < 0 ? 'var(--green)' : (c.delta.totalDelayMin ?? 0) > 0 ? 'var(--red)' : undefined }}>
                            {(c.delta.totalDelayMin ?? 0) < 0 ? '' : '+'}{c.delta.totalDelayMin ?? 0}m
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
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
              Evaluated {report.evaluatedCount} candidate actions · {report.improvingCount} improving ·
              Weights: {report.weights.strandedPax}×pax + {report.weights.delayMin}×delay + {report.weights.cancellation}×cancellation
            </p>
          )}
      </>
    </div>
  );
}

/** Minimal markdown-to-HTML for the AI rationale. */
function markdownToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
