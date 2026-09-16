import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type { Collection, HistoryEntry } from '../types/request';
import { buildDocsHtml, buildDocsMarkdown } from '../config/docs';

interface Props {
  collection: Collection;
  history?: HistoryEntry[];
  onClose: () => void;
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DocsModal({ collection, history = [], onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => buildDocsMarkdown(collection, history), [collection, history]);
  const slug = useMemo(
    () => collection.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'collection',
    [collection.name],
  );

  const copy = () => {
    navigator.clipboard?.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal code-modal docs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>📄 Tài liệu · {collection.name}</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <pre className="code-output docs-output">{markdown}</pre>
        </div>

        <div className="modal-foot cookie-foot">
          <Button onClick={copy}>{copied ? '✓ Đã copy' : 'Copy Markdown'}</Button>
          <Button onClick={() => download(markdown, `${slug}.md`, 'text/markdown')}>
            ↧ Tải .md
          </Button>
          <Button
            onClick={() =>
              download(buildDocsHtml(collection, history), `${slug}.html`, 'text/html')
            }
          >
            ↧ Tải .html
          </Button>
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
