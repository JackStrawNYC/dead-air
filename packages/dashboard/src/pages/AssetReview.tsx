import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAssetReview, regenerateAsset, approveAssets } from '../api';
import { useToast } from '../hooks/useToast';
import { formatBytes } from '../utils/format';
import Skeleton from '../components/Skeleton';

interface SegmentAsset {
  type: string;
  filePath: string;
  service?: string;
  prompt?: string;
  size?: number;
}

interface ReviewSegment {
  index: number;
  assets: SegmentAsset[];
}

export default function AssetReview() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const toast = useToast();

  const [segments, setSegments] = useState<ReviewSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!episodeId) return;
    setLoading(true);
    fetchAssetReview(episodeId)
      .then(data => setSegments(data.segments))
      .catch(err => toast('error', err.message))
      .finally(() => setLoading(false));
  }, [episodeId]);

  const handleRegenerate = async (segmentIndex: number, type: string) => {
    if (!episodeId) return;
    const key = `${segmentIndex}-${type}`;
    setRegenerating(key);
    try {
      await regenerateAsset(episodeId, { segmentIndex, type });
      toast('success', `Regenerating ${type} for segment ${segmentIndex}`);
      // Refresh after a brief delay
      setTimeout(() => {
        fetchAssetReview(episodeId)
          .then(data => setSegments(data.segments))
          .catch(() => {});
      }, 2000);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegenerating(null);
    }
  };

  const handleApprove = async () => {
    if (!episodeId) return;
    setApproving(true);
    try {
      await approveAssets(episodeId);
      toast('success', 'Assets approved — ready for render');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <Skeleton width={300} height={28} />
        </div>
        <div className="card"><Skeleton count={5} height={80} /></div>
      </div>
    );
  }

  const totalAssets = segments.reduce((sum, s) => sum + s.assets.length, 0);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text-muted)', fontSize: 13 }}>&larr; Home</Link>
          <h2>Asset Review — {episodeId}</h2>
        </div>
        <p>{segments.length} segments, {totalAssets} assets</p>
      </div>

      {segments.map(segment => (
        <div key={segment.index} className="card mb-16">
          <div className="card-header">
            <h3>Segment {segment.index}</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {segment.assets.length} assets
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {segment.assets.map((asset, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 12,
                  overflow: 'hidden',
                }}
              >
                {/* Asset preview */}
                {asset.type === 'image' && (
                  <div style={{
                    width: '100%',
                    height: 120,
                    background: 'var(--bg-elevated)',
                    borderRadius: 4,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={`/files/${encodeURIComponent(asset.filePath.split('/data/').pop() || '')}`}
                      alt={`Segment ${segment.index}`}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}

                {asset.type === 'narration' && (
                  <div style={{ marginBottom: 8 }}>
                    <audio
                      controls
                      style={{ width: '100%', height: 32 }}
                      src={`/files/${encodeURIComponent(asset.filePath.split('/data/').pop() || '')}`}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className={`badge badge-${asset.type === 'image' ? 'done' : asset.type === 'narration' ? 'running' : 'queued'}`}>
                      {asset.type}
                    </span>
                    {asset.service && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                        {asset.service}
                      </span>
                    )}
                  </div>
                  {asset.size && (
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {formatBytes(asset.size)}
                    </span>
                  )}
                </div>

                {asset.prompt && (
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    marginTop: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {asset.prompt}
                  </div>
                )}

                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 8, width: '100%', fontSize: 11, padding: '4px 8px' }}
                  onClick={() => handleRegenerate(segment.index, asset.type)}
                  disabled={regenerating === `${segment.index}-${asset.type}`}
                >
                  {regenerating === `${segment.index}-${asset.type}` ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {segments.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No assets found for this episode. Run the generate stage first.
        </div>
      )}

      {segments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={approving}
          >
            {approving ? 'Approving...' : 'Approve & Render'}
          </button>
          <Link to={`/episodes/${episodeId}`} className="btn btn-secondary">
            Episode Detail
          </Link>
        </div>
      )}
    </div>
  );
}
