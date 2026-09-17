type ChartKind = 'bar' | 'line';

export default function MiniChart({
  values,
  labels,
  kind,
}: {
  values: number[];
  labels: string[];
  kind: ChartKind;
}) {
  const W = 680;
  const H = 240;
  const pad = 30;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const y = (v: number) => pad + innerH - ((v - min) / range) * innerH;
  const showLabels = values.length <= 16;
  const zeroY = y(0);

  return (
    <svg className="viz-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} className="viz-axis" />
      {kind === 'bar'
        ? values.map((v, i) => {
            const bw = innerW / values.length;
            const bx = pad + i * bw + bw * 0.15;
            const top = Math.min(y(v), zeroY);
            const hgt = Math.abs(zeroY - y(v));
            return (
              <g key={i}>
                <rect x={bx} y={top} width={bw * 0.7} height={hgt} className="viz-bar" />
                {showLabels && (
                  <text x={bx + bw * 0.35} y={H - 8} className="viz-label" textAnchor="middle">
                    {labels[i]}
                  </text>
                )}
              </g>
            );
          })
        : (() => {
            const px = (i: number) =>
              pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
            const pts = values.map((v, i) => `${px(i)},${y(v)}`).join(' ');
            return (
              <g>
                <polyline points={pts} className="viz-line" fill="none" />
                {values.map((v, i) => (
                  <g key={i}>
                    <circle cx={px(i)} cy={y(v)} r={3} className="viz-dot" />
                    {showLabels && (
                      <text x={px(i)} y={H - 8} className="viz-label" textAnchor="middle">
                        {labels[i]}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          })()}
      <text x={pad} y={pad - 10} className="viz-label">
        {max}
      </text>
    </svg>
  );
}
