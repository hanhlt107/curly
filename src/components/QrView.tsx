import { useMemo } from 'react';
import { makeQrMatrix } from '../config/qr';

export default function QrView({ text }: { text: string }) {
  const matrix = useMemo(() => makeQrMatrix(text), [text]);
  if (!matrix) {
    return (
      <div className="p2p-qr-fail">
        Mã QR quá lớn để hiển thị — hãy dùng nút Copy và dán mã ở thiết bị kia.
      </div>
    );
  }
  const n = matrix.length;
  const quiet = 2;
  const size = n + quiet * 2;
  const path: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) path.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg
      className="p2p-qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Mã QR kết nối"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path.join('')} fill="#000000" />
    </svg>
  );
}
