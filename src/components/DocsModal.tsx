import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import type { Collection, HistoryEntry } from '../types/request';
import { buildDocsHtml, buildDocsMarkdown } from '../config/docs';
import { downloadText, slugify } from '../config/download';

interface Props {
  collection: Collection;
  history?: HistoryEntry[];
  onClose: () => void;
}

export default function DocsModal({ collection, history = [], onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => buildDocsMarkdown(collection, history), [collection, history]);
  const slug = useMemo(() => slugify(collection.name, 'collection'), [collection.name]);

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
          <Button onClick={() => downloadText(markdown, `${slug}.md`, 'text/markdown')}>
            ↧ Tải .md
          </Button>
          <Button
            onClick={() =>
              downloadText(buildDocsHtml(collection, history), `${slug}.html`, 'text/html')
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
