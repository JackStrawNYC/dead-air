/**
 * TagMultiSelect — searchable multi-select with selected items as removable tags.
 * Supports optional grouping of options.
 */

import { useState, useRef } from 'react';

interface TagGroup {
  label: string;
  items: string[];
}

interface Props {
  label: string;
  selected: string[];
  options: string[] | TagGroup[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

function isGrouped(options: string[] | TagGroup[]): options is TagGroup[] {
  return options.length > 0 && typeof options[0] === 'object';
}

function getAllItems(options: string[] | TagGroup[]): string[] {
  if (isGrouped(options)) {
    return options.flatMap(g => g.items);
  }
  return options as string[];
}

export default function TagMultiSelect({ label, selected, options, onChange, placeholder }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allItems = getAllItems(options);
  const available = allItems.filter(item =>
    !selected.includes(item) &&
    item.toLowerCase().includes(search.toLowerCase())
  );

  const add = (item: string) => {
    onChange([...selected, item]);
    setSearch('');
  };

  const remove = (item: string) => {
    onChange(selected.filter(s => s !== item));
  };

  return (
    <div style={{ marginBottom: 12 }} ref={ref}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
        {label}
      </label>

      {/* Selected tags */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map(item => (
            <span
              key={item}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '2px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {item}
              <button
                onClick={() => remove(item)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--red)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder || `Search ${label.toLowerCase()}...`}
          style={{ width: '100%', fontSize: 12 }}
        />

        {/* Dropdown */}
        {open && available.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {isGrouped(options) ? (
              options.map(group => {
                const groupAvailable = group.items.filter(i =>
                  !selected.includes(i) &&
                  i.toLowerCase().includes(search.toLowerCase())
                );
                if (groupAvailable.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {group.label}
                    </div>
                    {groupAvailable.map(item => (
                      <div
                        key={item}
                        onMouseDown={() => add(item)}
                        style={{
                          padding: '4px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                );
              })
            ) : (
              available.slice(0, 30).map(item => (
                <div
                  key={item}
                  onMouseDown={() => add(item)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {item}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
