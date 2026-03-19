import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  searchArchive,
  fetchArchiveFiles,
  fetchSetlistPreview,
  fetchShows,
  fetchPreflight,
  startFullPipeline,
  runPipeline,
  runBridge,
  startVisualizerRender,
  getPreviewUrl,
  type ArchiveRecording,
  type SetlistPreview,
  type ArchiveFileInfo,
} from '../api';
import type { Show, PreflightResult } from '../types';
import { useJob } from '../hooks/useJob';
import { useToast } from '../hooks/useToast';
import { useNotifications } from '../hooks/useNotifications';
import { formatBytes } from '../utils/format';
import WizardStepIndicator from '../components/WizardStepIndicator';
import PresetSelector from '../components/PresetSelector';
import StageTracker from '../components/StageTracker';
import SegmentGrid from '../components/SegmentGrid';
import BridgeReviewPanel from '../components/BridgeReviewPanel';
import CompositionControls from '../components/CompositionControls';
import type { CompositionOptions } from '../components/CompositionControls';
import CostEstimate from '../components/CostEstimate';

type WizardStep = 'search' | 'recording' | 'setlist' | 'configure' | 'preflight' | 'running' | 'bridge' | 'bridge-review' | 'preview' | 'rendering' | 'complete';

const STEPS = [
  { key: 'search', label: 'Find Show' },
  { key: 'recording', label: 'Recording' },
  { key: 'setlist', label: 'Setlist' },
  { key: 'configure', label: 'Configure' },
  { key: 'preflight', label: 'Pre-Flight' },
  { key: 'running', label: 'Pipeline' },
  { key: 'bridge', label: 'Bridge' },
  { key: 'bridge-review', label: 'Review' },
  { key: 'preview', label: 'Preview' },
  { key: 'rendering', label: 'Render' },
  { key: 'complete', label: 'Complete' },
];

export default function Produce() {
  const toast = useToast();
  const { requestPermission, notify } = useNotifications();

  // Wizard state
  const [step, setStep] = useState<WizardStep>('search');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // Step 1: Search
  const [date, setDate] = useState('');
  const [recordings, setRecordings] = useState<ArchiveRecording[]>([]);
  const [searching, setSearching] = useState(false);
  const [existingShows, setExistingShows] = useState<Show[]>([]);
  const [useExisting, setUseExisting] = useState(false);

  // Step 2: Recording
  const [selectedRecording, setSelectedRecording] = useState<ArchiveRecording | null>(null);
  const [audioFiles, setAudioFiles] = useState<ArchiveFileInfo[]>([]);
  const [totalSize, setTotalSize] = useState(0);

  // Step 3: Setlist
  const [setlistPreview, setSetlistPreview] = useState<SetlistPreview | null>(null);
  const [setlistLoading, setSetlistLoading] = useState(false);

  // Step 4: Configure
  const [preset, setPreset] = useState('preview');
  const [fromStage, setFromStage] = useState('');
  const [toStage, setToStage] = useState('');
  const [force, setForce] = useState(false);
  const [seed, setSeed] = useState('');
  const [composition, setComposition] = useState<CompositionOptions>({
    noIntro: false, noEndCard: false, noChapters: false, noSetBreaks: false, setBreakSeconds: 10,
  });

  // Step 5: Preflight
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  // Step 6: Running (pipeline)
  const [jobId, setJobId] = useState<string | null>(null);
  const { log, logEntries, currentStage, stageTimings, result, connected, done } = useJob(jobId);

  // Bridge job
  const [bridgeJobId, setBridgeJobId] = useState<string | null>(null);
  const bridgeJob = useJob(bridgeJobId);

  // Preview
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const previewJob = useJob(previewJobId);
  const [previewTrackId, setPreviewTrackId] = useState('');

  // Render job
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const renderJob = useJob(renderJobId);

  // Load existing shows & request notifications
  useEffect(() => {
    fetchShows().then(setExistingShows).catch(() => {});
    requestPermission();
  }, []);

  const completeStep = useCallback((currentStep: WizardStep, nextStep: WizardStep) => {
    setCompletedSteps(prev => [...prev.filter(s => s !== currentStep), currentStep]);
    setStep(nextStep);
  }, []);

  // Handle pipeline job completion → auto-trigger bridge
  useEffect(() => {
    if (done && result && step === 'running') {
      if (result.success) {
        notify('Pipeline Complete', `Pipeline for ${date} finished successfully`);
        // Auto-trigger bridge
        handleStartBridge();
      } else {
        notify('Pipeline Failed', `Pipeline for ${date} failed`);
        completeStep('running', 'complete');
      }
    }
  }, [done, result, step]);

  // Handle bridge job completion
  useEffect(() => {
    if (bridgeJob.done && bridgeJob.result && step === 'bridge') {
      if (bridgeJob.result.success) {
        notify('Bridge Complete', `Bridge pipeline for ${date} finished`);
        completeStep('bridge', 'bridge-review');
      } else {
        notify('Bridge Failed', `Bridge for ${date} failed`);
        completeStep('bridge', 'complete');
      }
    }
  }, [bridgeJob.done, bridgeJob.result, step]);

  // Handle preview job completion
  useEffect(() => {
    if (previewJob.done && previewJob.result && step === 'preview') {
      if (previewJob.result.success) {
        notify('Preview Ready', `10-second preview rendered for ${previewTrackId}`);
      }
    }
  }, [previewJob.done, previewJob.result, step]);

  // Handle full render completion
  useEffect(() => {
    if (renderJob.done && renderJob.result && step === 'rendering') {
      notify(
        renderJob.result.success ? 'Render Complete' : 'Render Failed',
        renderJob.result.success ? `Full render for ${date} complete` : `Render for ${date} failed`,
      );
      completeStep('rendering', 'complete');
    }
  }, [renderJob.done, renderJob.result, step]);

  // ── Step 1: Search ──

  const handleSearch = async () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast('error', 'Enter a valid date (YYYY-MM-DD)');
      return;
    }
    setSearching(true);
    try {
      const res = await searchArchive({ date });
      setRecordings(res.recordings);
      if (res.recordings.length > 0) {
        completeStep('search', 'recording');
      } else {
        toast('info', 'No recordings found for this date');
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectExisting = (show: Show) => {
    setDate(show.date);
    setUseExisting(true);
    setCompletedSteps(['search', 'recording', 'setlist']);
    setStep('configure');
  };

  // ── Step 2: Recording ──

  const handleSelectRecording = async (rec: ArchiveRecording) => {
    setSelectedRecording(rec);
    try {
      const files = await fetchArchiveFiles(rec.identifier);
      setAudioFiles(files.audioFiles);
      setTotalSize(files.totalSize);
    } catch {
      toast('error', 'Failed to load recording files');
    }

    setSetlistLoading(true);
    try {
      const setlist = await fetchSetlistPreview(rec.date || date);
      setSetlistPreview(setlist);
    } catch {
      // Setlist is optional
    } finally {
      setSetlistLoading(false);
    }

    completeStep('recording', 'setlist');
  };

  // ── Step 3: Setlist ──

  const handleSetlistContinue = () => {
    completeStep('setlist', 'configure');
  };

  // ── Step 4: Configure ──

  const handleConfigure = () => {
    completeStep('configure', 'preflight');
    setPreflightLoading(true);
    fetchPreflight(date)
      .then(r => {
        setPreflight(r);
      })
      .catch(() => {
        toast('error', 'Preflight failed');
      })
      .finally(() => setPreflightLoading(false));
  };

  // ── Step 5: Launch Pipeline ──

  const handleLaunch = async () => {
    try {
      let res;
      if (useExisting) {
        res = await runPipeline(date, {
          from: fromStage || undefined,
          to: toStage || undefined,
          force: force || undefined,
        });
      } else {
        res = await startFullPipeline(date, selectedRecording?.identifier);
      }
      setJobId(res.jobId);
      completeStep('preflight', 'running');
      toast('success', 'Pipeline launched');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to launch pipeline');
    }
  };

  // ── Bridge ──

  const handleStartBridge = async () => {
    try {
      const res = await runBridge(date);
      setBridgeJobId(res.jobId);
      completeStep('running', 'bridge');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to start bridge');
      completeStep('running', 'complete');
    }
  };

  // ── Preview ──

  const handleStartPreview = async (trackId: string) => {
    setPreviewTrackId(trackId);
    try {
      const res = await startVisualizerRender({ preview: true, track: trackId, preset, seed: seed ? parseInt(seed, 10) : undefined });
      setPreviewJobId(res.jobId);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to start preview');
    }
  };

  // ── Full Render ──

  const handleStartFullRender = async () => {
    try {
      const res = await startVisualizerRender({
        preset,
        seed: seed ? parseInt(seed, 10) : undefined,
        noIntro: composition.noIntro || undefined,
        noEndCard: composition.noEndCard || undefined,
        noChapters: composition.noChapters || undefined,
        noSetBreaks: composition.noSetBreaks || undefined,
        setBreakSeconds: composition.setBreakSeconds !== 10 ? composition.setBreakSeconds : undefined,
      });
      setRenderJobId(res.jobId);
      completeStep(step as WizardStep, 'rendering');
      toast('success', 'Full render started');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to start render');
    }
  };

  // ── Render ──

  const STAGES_LIST = ['ingest', 'analyze', 'research', 'script', 'generate', 'render'];

  // Estimate song count from setlist
  const songCount = setlistPreview?.songs?.length || 12;

  return (
    <div>
      <div className="page-header">
        <h2>Produce</h2>
        <p>End-to-end production wizard</p>
      </div>

      <WizardStepIndicator steps={STEPS} currentStep={step} completedSteps={completedSteps} />

      {/* Step 1: Find Show */}
      {step === 'search' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Find Show</h3>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                SHOW DATE
              </label>
              <input
                type="text"
                placeholder="YYYY-MM-DD"
                value={date}
                onChange={e => setDate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{ width: 160, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
              {searching ? 'Searching...' : 'Search Archive'}
            </button>
          </div>

          {existingShows.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Or select existing show
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {existingShows.slice(0, 20).map(show => (
                  <button
                    key={show.id}
                    className="btn btn-secondary"
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, fontSize: 12 }}
                    onClick={() => handleSelectExisting(show)}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{show.date}</span>
                    {' '}{show.venue}, {show.city}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Recording */}
      {step === 'recording' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Select Recording ({recordings.length} found)</h3>
            <button className="btn btn-secondary" onClick={() => setStep('search')}>Back</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recordings.map(rec => (
              <button
                key={rec.identifier}
                onClick={() => handleSelectRecording(rec)}
                style={{
                  background: selectedRecording?.identifier === rec.identifier ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${selectedRecording?.identifier === rec.identifier ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  padding: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{rec.title}</span>
                  <span className={`badge badge-${rec.sourceType === 'SBD' ? 'done' : 'queued'}`}>
                    {rec.sourceType}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {rec.identifier}
                  {rec.score > 0 && <span style={{ marginLeft: 8 }}>Score: {rec.score.toFixed(1)}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Setlist Preview */}
      {step === 'setlist' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Setlist Preview</h3>
            <button className="btn btn-secondary" onClick={() => setStep('recording')}>Back</button>
          </div>
          {setlistLoading ? (
            <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading setlist...</div>
          ) : setlistPreview ? (
            <div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <strong>{setlistPreview.venue.name}</strong>
                {' '}{setlistPreview.venue.city}, {setlistPreview.venue.state}
                {setlistPreview.tour && <span style={{ color: 'var(--text-muted)' }}> ({setlistPreview.tour})</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {setlistPreview.songs.map((song, i) => {
                  const prevSet = i > 0 ? setlistPreview.songs[i - 1].setNumber : null;
                  const showSetHeader = song.setNumber !== prevSet;
                  return (
                    <div key={i}>
                      {showSetHeader && (
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', marginTop: i > 0 ? 8 : 0, marginBottom: 4,
                        }}>
                          {song.setNumber === 0 ? 'Encore' : `Set ${song.setNumber}`}
                        </div>
                      )}
                      <div style={{ fontSize: 13, padding: '2px 0', fontFamily: 'var(--font-mono)' }}>
                        {song.songName}
                        {song.isSegue && <span style={{ color: 'var(--amber)' }}> &gt;</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalSize > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  {audioFiles.length} audio files ({formatBytes(totalSize)})
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 20, color: 'var(--text-muted)' }}>
              No setlist found on setlist.fm — songs will be identified during analysis
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSetlistContinue}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 4: Configure */}
      {step === 'configure' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Configure</h3>
            <button className="btn btn-secondary" onClick={() => setStep(useExisting ? 'search' : 'setlist')}>Back</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
              Render Preset
            </label>
            <PresetSelector value={preset} onChange={setPreset} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <CostEstimate songs={songCount} preset={preset} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FROM STAGE</label>
              <select value={fromStage} onChange={e => setFromStage(e.target.value)} style={{ width: 120 }}>
                <option value="">Start</option>
                {STAGES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TO STAGE</label>
              <select value={toStage} onChange={e => setToStage(e.target.value)} style={{ width: 120 }}>
                <option value="">End</option>
                {STAGES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SEED</label>
              <input
                type="number"
                placeholder="Optional"
                value={seed}
                onChange={e => setSeed(e.target.value)}
                style={{ width: 100, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
                Force re-run
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <CompositionControls value={composition} onChange={setComposition} />
          </div>

          <button className="btn btn-primary" onClick={handleConfigure}>
            Run Pre-Flight
          </button>
        </div>
      )}

      {/* Step 5: Preflight */}
      {step === 'preflight' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Pre-Flight Checks</h3>
            <button className="btn btn-secondary" onClick={() => setStep('configure')}>Back</button>
          </div>

          {preflightLoading ? (
            <div style={{ padding: 20, color: 'var(--text-muted)' }}>Running checks...</div>
          ) : preflight ? (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {preflight.checks.map(check => (
                  <div key={check.stage} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--font-mono)',
                  }}>
                    <span style={{ color: check.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {check.ok ? '\u2713' : '\u2717'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', minWidth: 100 }}>{check.stage}</span>
                    {check.message && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{check.message}</span>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={handleLaunch}>
                  Launch Pipeline
                </button>
                {!preflight.ready && (
                  <span style={{ fontSize: 12, color: 'var(--amber)' }}>
                    Some checks failed — proceed with caution
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Step 6: Running (Pipeline) */}
      {step === 'running' && jobId && (
        <div className="card mb-16">
          <StageTracker
            currentStage={currentStage}
            stageTimings={stageTimings}
            logEntries={logEntries}
            result={result}
            done={done}
            connected={connected}
          />
          {currentStage === 'render' && !done && (
            <div style={{ marginTop: 12 }}>
              <SegmentGrid segments={[]} total={0} completed={0} />
            </div>
          )}
        </div>
      )}

      {/* Step 7: Bridge */}
      {step === 'bridge' && bridgeJobId && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Bridge Pipeline</h3>
            {bridgeJob.connected ? (
              <span className="badge badge-running">Running</span>
            ) : bridgeJob.done ? (
              <span className={`badge ${bridgeJob.result?.success ? 'badge-done' : 'badge-failed'}`}>
                {bridgeJob.result?.success ? 'Done' : 'Failed'}
              </span>
            ) : (
              <span className="badge badge-queued">Connecting...</span>
            )}
          </div>
          <div style={{
            maxHeight: 200, overflow: 'auto',
            background: 'var(--bg-base)', borderRadius: 'var(--radius)',
            padding: 8, marginTop: 8,
          }}>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
              {bridgeJob.log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </div>
        </div>
      )}

      {/* Step 8: Bridge Review */}
      {step === 'bridge-review' && (
        <div className="card mb-16">
          <BridgeReviewPanel
            date={date}
            onAcceptRender={handleStartFullRender}
            onPreviewFirst={() => {
              completeStep('bridge-review', 'preview');
            }}
          />
        </div>
      )}

      {/* Step 9: Preview */}
      {step === 'preview' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>10-Second Preview</h3>
            <button className="btn btn-secondary" onClick={() => setStep('bridge-review')}>Back to Review</button>
          </div>

          {!previewJobId ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  TRACK TO PREVIEW
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="e.g., s1t05"
                    value={previewTrackId}
                    onChange={e => setPreviewTrackId(e.target.value)}
                    style={{ width: 120, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => handleStartPreview(previewTrackId || 's1t05')}
                    disabled={!previewTrackId}
                  >
                    Render Preview
                  </button>
                </div>
              </div>
            </div>
          ) : previewJob.done && previewJob.result?.success ? (
            <div>
              <video
                controls
                autoPlay
                style={{
                  width: '100%', maxHeight: 400,
                  background: '#000', borderRadius: 'var(--radius)',
                  marginBottom: 12,
                }}
                src={getPreviewUrl(previewTrackId)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleStartFullRender}>
                  Looks Good — Full Render
                </button>
                <button className="btn btn-secondary" onClick={() => {
                  setPreviewJobId(null);
                  setStep('bridge-review');
                }}>
                  Back to Edit
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                {previewJob.done && !previewJob.result?.success
                  ? 'Preview render failed'
                  : 'Rendering preview...'}
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
                background: 'var(--bg-base)', borderRadius: 'var(--radius)',
                padding: 8, maxHeight: 150, overflow: 'auto',
              }}>
                {previewJob.log.slice(-20).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </pre>
              {previewJob.done && !previewJob.result?.success && (
                <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setPreviewJobId(null)}>
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 10: Rendering (Full) */}
      {step === 'rendering' && renderJobId && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>Full Render</h3>
            {renderJob.connected ? (
              <span className="badge badge-running">Rendering</span>
            ) : renderJob.done ? (
              <span className={`badge ${renderJob.result?.success ? 'badge-done' : 'badge-failed'}`}>
                {renderJob.result?.success ? 'Done' : 'Failed'}
              </span>
            ) : (
              <span className="badge badge-queued">Connecting...</span>
            )}
          </div>
          <div style={{
            maxHeight: 300, overflow: 'auto',
            background: 'var(--bg-base)', borderRadius: 'var(--radius)',
            padding: 8, marginTop: 8,
          }}>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
              {renderJob.log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </div>
        </div>
      )}

      {/* Step 11: Complete */}
      {step === 'complete' && (
        <div className="card mb-16">
          <div className="card-header">
            <h3>
              {renderJob.result?.success ? 'Production Complete' :
               result?.success === false ? 'Pipeline Failed' :
               bridgeJob.result?.success === false ? 'Bridge Failed' :
               renderJob.result?.success === false ? 'Render Failed' :
               'Production Complete'}
            </h3>
          </div>

          <div style={{
            padding: 20,
            textAlign: 'center',
            background: (renderJob.result?.success || result?.success) ? 'var(--green-dim)' : 'var(--red-dim, rgba(239,68,68,0.1))',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {(renderJob.result?.success || result?.success) ? '\u2713' : '\u2717'}
            </div>
            <div style={{
              fontSize: 16, fontWeight: 700,
              color: (renderJob.result?.success || result?.success) ? 'var(--green)' : 'var(--red)',
            }}>
              {renderJob.result?.success
                ? `Episode for ${date} rendered successfully`
                : result?.success === false
                  ? `Pipeline failed: ${result?.error || 'Unknown error'}`
                  : bridgeJob.result?.success === false
                    ? `Bridge failed: ${bridgeJob.result?.error || 'Unknown error'}`
                    : renderJob.result?.success === false
                      ? `Render failed: ${renderJob.result?.error || 'Unknown error'}`
                      : `Episode for ${date} produced successfully`}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(renderJob.result?.success || result?.success) && (
              <>
                <Link to={`/episodes/ep-${date}`} className="btn btn-primary">
                  View Episode
                </Link>
                <Link to={`/render/ep-${date}`} className="btn btn-secondary">
                  Render Monitor
                </Link>
                <Link to={`/assets/ep-${date}`} className="btn btn-secondary">
                  View Assets
                </Link>
              </>
            )}
            {(result?.success === false || bridgeJob.result?.success === false || renderJob.result?.success === false) && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setStep('configure');
                  setCompletedSteps(prev => prev.filter(s =>
                    s !== 'running' && s !== 'bridge' && s !== 'bridge-review' &&
                    s !== 'preview' && s !== 'rendering' && s !== 'complete'
                  ));
                }}
              >
                Reconfigure & Retry
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStep('search');
                setCompletedSteps([]);
                setDate('');
                setRecordings([]);
                setSelectedRecording(null);
                setJobId(null);
                setBridgeJobId(null);
                setPreviewJobId(null);
                setRenderJobId(null);
                setUseExisting(false);
              }}
            >
              New Production
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
