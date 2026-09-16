import qrcode from 'qrcode-generator';

export function makeQrMatrix(text: string): boolean[][] | null {
  try {
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const matrix: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      matrix.push(row);
    }
    return matrix;
  } catch {
    return null;
  }
}
