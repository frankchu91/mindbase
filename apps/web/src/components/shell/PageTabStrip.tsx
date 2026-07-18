// apps/web/src/components/shell/PageTabStrip.tsx
//
// Tab bar shown above the canvas when there are open page tabs. Click a tab
// to switch active page; × to close. Behavior mirrors Obsidian.
import { X, FileText, FileCog, FilePlus2 } from 'lucide-react';
import { usePageTabs, type PageTab } from '../../store/page-tabs';
import { useCanvasRoute } from '../../store/canvas-route';

const KIND_ICON = {
  article: <FileText size={11} strokeWidth={2} />,
  note: <FilePlus2 size={11} strokeWidth={2} />,
  raw: <FileCog size={11} strokeWidth={2} />,
} as const;

export function PageTabStrip() {
  const tabs = usePageTabs((s) => s.tabs);
  const activeId = usePageTabs((s) => s.activeTabId);
  const switchTo = usePageTabs((s) => s.switchTo);
  const closeTab = usePageTabs((s) => s.closeTab);
  const navigate = useCanvasRoute((s) => s.navigate);

  if (tabs.length === 0) return null;

  function onActivate(tab: PageTab): void {
    switchTo(tab.id);
    navigate(tab.route);
  }

  return (
    <div
      className="flex items-stretch gap-px overflow-x-auto shrink-0"
      style={{
        background: 'var(--bg)',
        borderBottom: '0.5px solid var(--hairline)',
        minHeight: 30,
      }}
      data-testid="page-tab-strip"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onActivate(tab)}
            onMouseDown={(e) => {
              // Middle-click closes — common browser convention.
              if (e.button === 1) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] cursor-pointer max-w-[200px] group"
            style={{
              background: active ? 'var(--surface-1)' : 'transparent',
              borderTop: active ? '2px solid var(--accent)' : '2px solid transparent',
              borderRight: '0.5px solid var(--hairline)',
              color: active ? 'var(--text-high)' : 'var(--text-mid)',
              fontWeight: active ? 500 : 400,
            }}
          >
            <span className="shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-mid)' }}>
              {KIND_ICON[tab.route.kind]}
            </span>
            <span className="truncate flex-1" title={tab.title}>
              {tab.title || untitledFallback(tab)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5 rounded"
              style={{ color: 'var(--text-mid)' }}
              aria-label="Close tab"
              title="Close (Cmd+W)"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function untitledFallback(tab: PageTab): string {
  switch (tab.route.kind) {
    case 'article': return tab.route.slug;
    case 'note': return tab.route.slug;
    case 'raw': return `raw:${tab.route.rawId}`;
  }
}
