import type { RequestTab } from '../types/request';

interface Props {
  tabs: RequestTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: Props) {
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab ${t.id === activeTabId ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <span className={`m-tag m-${t.request.method}`}>{t.request.method}</span>
          <span className="tab-name">{t.name}</span>
          {t.dirty && <span className="dirty-dot" title="Chưa lưu" />}
          <button
            className="tab-close"
            title="Đóng tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} title="Tab mới">
        +
      </button>
    </div>
  );
}
