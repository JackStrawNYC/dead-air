interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  count?: number;
}

export default function Skeleton({ width = '100%', height = 16, count = 1 }: SkeletonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height,
          }}
        />
      ))}
    </div>
  );
}
