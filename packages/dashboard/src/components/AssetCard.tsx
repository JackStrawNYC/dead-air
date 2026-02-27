import { useState } from 'react';

interface AssetCardProps {
  type: string;
  path: string;
  size?: number;
  service?: string;
  cost?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function AssetCard({ type, path, size, service, cost }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const filename = path.split('/').pop() || path;
  const isImage = type === 'image';
  const isAudio = type === 'audio';
  const isVideo = type === 'video';

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path).catch(() => {});
  };

  return (
    <>
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          cursor: isImage || isVideo ? 'pointer' : 'default',
        }}
        onClick={() => (isImage || isVideo) && setExpanded(true)}
      >
        {isImage && (
          <div style={{ height: 120, background: 'var(--bg-base)', overflow: 'hidden' }}>
            <img
              src={`/files/${path}`}
              alt={filename}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        {isVideo && (
          <div style={{ height: 120, background: 'var(--bg-base)', overflow: 'hidden' }}>
            <video
              src={`/files/${path}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
              preload="metadata"
            />
          </div>
        )}
        {isAudio && (
          <div style={{ padding: '12px', background: 'var(--bg-base)' }}>
            <audio controls src={`/files/${path}`} style={{ width: '100%', height: 32 }} preload="none" />
          </div>
        )}
        <div style={{ padding: '10px 12px' }}>
          <div
            className="truncate"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}
            title={filename}
          >
            {filename}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center' }}>
            <span className={`badge badge-type-${type === 'image' ? 'image' : type === 'audio' ? 'audio' : type === 'video' ? 'video' : 'other'}`}>
              {type}
            </span>
            {service && <span>{service}</span>}
            {size != null && <span>{formatBytes(size)}</span>}
            {cost != null && cost > 0 && <span style={{ color: 'var(--amber)' }}>${cost.toFixed(4)}</span>}
            <button
              onClick={handleCopyPath}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: 10, cursor: 'pointer', padding: '0 4px', marginLeft: 'auto',
              }}
              title="Copy path"
            >
              copy
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer',
          }}
          onClick={() => setExpanded(false)}
        >
          {isImage && (
            <img
              src={`/files/${path}`}
              alt={filename}
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
            />
          )}
          {isVideo && (
            <video
              src={`/files/${path}`}
              controls
              autoPlay
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 'var(--radius-lg)' }}
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
