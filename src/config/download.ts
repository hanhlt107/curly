export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
}

export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  downloadBlob(text, filename, type);
}

export function slugify(name: string, fallback: string): string {
  return name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được file.'));
    reader.readAsText(file);
  });
}
