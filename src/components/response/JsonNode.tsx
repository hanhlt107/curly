import { useState } from 'react';
import { cellText, isObjectRecord } from '../../config/visualize';
import { valueType } from '../../config/responseFormat';

export default function JsonNode({
  label,
  value,
  depth,
}: {
  label?: string;
  value: unknown;
  depth: number;
}) {
  const isArr = Array.isArray(value);
  const isObj = isObjectRecord(value);
  const [open, setOpen] = useState(depth < 1);

  if (!isArr && !isObj) {
    return (
      <div className="jt-row" style={{ paddingLeft: depth * 14 }}>
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className={`jt-val jt-${valueType(value)}`}>{cellText(value)}</span>
      </div>
    );
  }

  const entries: [string, unknown][] = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const summary = isArr ? `array[${entries.length}]` : `object{${entries.length}}`;

  return (
    <div className="jt-node">
      <div
        className="jt-row jt-toggle"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jt-caret">{open ? '▾' : '▸'}</span>
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className="jt-type">{summary}</span>
      </div>
      {open && entries.map(([k, v]) => <JsonNode key={k} label={k} value={v} depth={depth + 1} />)}
    </div>
  );
}
