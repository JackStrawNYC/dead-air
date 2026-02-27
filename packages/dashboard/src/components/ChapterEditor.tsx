import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface Chapter {
  before?: string;
  after?: string;
  text: string;
}

interface ChapterEditorProps {
  chapters: Chapter[];
  trackIds?: string[];
  onChange: (chapters: Chapter[]) => void;
}

export default function ChapterEditor({ chapters, trackIds = [], onChange }: ChapterEditorProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const updateChapter = (index: number, patch: Partial<Chapter>) => {
    onChange(chapters.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeChapter = (index: number) => {
    onChange(chapters.filter((_, i) => i !== index));
    setConfirmRemove(null);
  };

  const addChapter = () => {
    onChange([...chapters, { text: 'New chapter card text' }]);
    setEditIdx(chapters.length);
  };

  return (
    <div>
      {/* Track ID datalist for autocomplete */}
      {trackIds.length > 0 && (
        <datalist id="trackId-list">
          {trackIds.map(id => <option key={id} value={id} />)}
        </datalist>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chapters.map((ch, i) => (
          <div
            key={i}
            style={{
              background: editIdx === i ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
            }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {ch.before ? `before: ${ch.before}` : ch.after ? `after: ${ch.after}` : 'unlinked'}
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => setEditIdx(editIdx === i ? null : i)}
              >
                {editIdx === i ? 'Close' : 'Edit'}
              </button>
              <button
                className="btn btn-danger"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => setConfirmRemove(i)}
              >
                Remove
              </button>
            </div>
            {editIdx === i ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    placeholder="before trackId"
                    value={ch.before || ''}
                    onChange={e => updateChapter(i, { before: e.target.value || undefined })}
                    list="trackId-list"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <input
                    placeholder="after trackId"
                    value={ch.after || ''}
                    onChange={e => updateChapter(i, { after: e.target.value || undefined })}
                    list="trackId-list"
                    style={{ flex: 1, fontSize: 12 }}
                  />
                </div>
                <textarea
                  value={ch.text}
                  onChange={e => updateChapter(i, { text: e.target.value })}
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                />
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ch.text}</p>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-secondary mt-16" onClick={addChapter}>
        + Add Chapter
      </button>

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove Chapter"
        message="Are you sure you want to remove this chapter card? This cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => confirmRemove !== null && removeChapter(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
