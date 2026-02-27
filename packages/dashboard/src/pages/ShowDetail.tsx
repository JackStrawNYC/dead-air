import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchShow, fetchSetlist, saveSetlist,
  fetchChapters, saveChapters,
  fetchOverlaySchedule, saveOverlaySchedule,
  startVisualizerRender,
} from '../api';
import { useJob } from '../hooks/useJob';
import SetlistEditor from '../components/SetlistEditor';
import ChapterEditor from '../components/ChapterEditor';
import OverlayScheduleEditor from '../components/OverlayScheduleEditor';
import LogStream from '../components/LogStream';

type Tab = 'info' | 'setlist' | 'chapters' | 'overlays';

export default function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const [show, setShow] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('info');

  // Setlist state
  const [setlistData, setSetlistData] = useState<any>(null);
  const [setlistDirty, setSetlistDirty] = useState(false);

  // Chapters state
  const [chaptersData, setChaptersData] = useState<any>(null);
  const [chaptersDirty, setChaptersDirty] = useState(false);

  // Overlays state
  const [overlaysData, setOverlaysData] = useState<any>(null);
  const [overlaysDirty, setOverlaysDirty] = useState(false);

  // Render job
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const { log: renderLog, done: renderDone, result: renderResult } = useJob(renderJobId);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetchShow(id).then(setShow);
      fetchSetlist().then(setSetlistData).catch(() => {});
      fetchChapters().then(setChaptersData).catch(() => {});
      fetchOverlaySchedule().then(setOverlaysData).catch(() => {});
    }
  }, [id]);

  const handleSaveSetlist = async () => {
    if (!setlistData) return;
    setSaving(true);
    await saveSetlist(setlistData);
    setSetlistDirty(false);
    setSaving(false);
  };

  const handleSaveChapters = async () => {
    if (!chaptersData) return;
    setSaving(true);
    await saveChapters(chaptersData);
    setChaptersDirty(false);
    setSaving(false);
  };

  const handleSaveOverlays = async () => {
    if (!overlaysData) return;
    setSaving(true);
    await saveOverlaySchedule({ ...overlaysData, songs: overlaysData.songs });
    setOverlaysDirty(false);
    setSaving(false);
  };

  const handleRender = async () => {
    const { jobId } = await startVisualizerRender({ resume: true });
    setRenderJobId(jobId);
  };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'info', label: 'Info' },
    { key: 'setlist', label: 'Setlist' },
    { key: 'chapters', label: 'Chapters' },
    { key: 'overlays', label: 'Overlays' },
  ];

  if (!show) return <div className="card" style={{ padding: 40 }}><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/shows" style={{ color: 'var(--text-muted)', fontSize: 13 }}>&larr; Shows</Link>
          <h2>{show.date} &mdash; {show.venue}</h2>
        </div>
        <p>{show.city}, {show.state}</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleRender}>
          Render Show
        </button>
      </div>

      {/* Tab content */}
      {tab === 'info' && (
        <div className="card">
          <div className="grid-2">
            <div>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Recording</h4>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{show.recording_source || 'Unknown'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Quality: {show.recording_quality_grade || 'N/A'}</p>
            </div>
            <div>
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Catalog</h4>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Score: {show.catalog_score?.toFixed(1) || 'N/A'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Archive ID: {show.recording_id || show.metadata?.archiveOrgId || 'N/A'}
              </p>
            </div>
          </div>
          {show.setlist?.length > 0 && (
            <div className="mt-24">
              <h4 style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Setlist ({show.setlist.length} songs)</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {show.setlist.map((s: any, i: number) => (
                  <span
                    key={i}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {s.songName || s.title || s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-16" style={{ display: 'flex', gap: 8 }}>
            <Link to={`/pipeline/${show.date}`} className="btn btn-secondary">
              Open Pipeline &rarr;
            </Link>
            <Link to={`/shows/${id}/analysis`} className="btn btn-secondary">
              Analysis &rarr;
            </Link>
          </div>
        </div>
      )}

      {tab === 'setlist' && setlistData && (
        <div className="card">
          <div className="card-header">
            <h3>Setlist Editor</h3>
            <button
              className="btn btn-primary"
              onClick={handleSaveSetlist}
              disabled={!setlistDirty || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <SetlistEditor
            songs={setlistData.songs || []}
            onChange={songs => {
              setSetlistData({ ...setlistData, songs });
              setSetlistDirty(true);
            }}
          />
        </div>
      )}

      {tab === 'chapters' && chaptersData && (
        <div className="card">
          <div className="card-header">
            <h3>Chapter Cards</h3>
            <button
              className="btn btn-primary"
              onClick={handleSaveChapters}
              disabled={!chaptersDirty || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <ChapterEditor
            chapters={chaptersData.chapters || []}
            onChange={chapters => {
              setChaptersData({ ...chaptersData, chapters });
              setChaptersDirty(true);
            }}
          />
        </div>
      )}

      {tab === 'overlays' && overlaysData && (
        <div className="card">
          <div className="card-header">
            <h3>Overlay Schedule</h3>
            <button
              className="btn btn-primary"
              onClick={handleSaveOverlays}
              disabled={!overlaysDirty || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <OverlayScheduleEditor
            songs={overlaysData.songs || {}}
            onChange={songs => {
              setOverlaysData({ ...overlaysData, songs });
              setOverlaysDirty(true);
            }}
          />
        </div>
      )}

      {/* Render log */}
      {renderJobId && (
        <div className="card mt-16">
          <div className="card-header">
            <h3>Render Output</h3>
            {renderDone && (
              <span style={{ color: renderResult?.success ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                {renderResult?.success ? 'Complete' : `Failed: ${renderResult?.error}`}
              </span>
            )}
          </div>
          <LogStream lines={renderLog} maxHeight={300} />
        </div>
      )}
    </div>
  );
}
