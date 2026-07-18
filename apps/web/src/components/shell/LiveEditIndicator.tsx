import { useLiveEdit } from '../../store/live-edit';
import { useCanvasRoute } from '../../store/canvas-route';

export function LiveEditIndicator() {
  const writingTo = useLiveEdit((s) => s.writingTo);
  const navigate = useCanvasRoute((s) => s.navigate);

  if (!writingTo) return null;

  return (
    <div
      data-testid="live-edit-indicator"
      className="my-1 px-3 py-2 rounded-md flex items-center gap-2 text-[12.5px]"
      style={{
        background: 'var(--live-soft)',
        border: '0.5px solid var(--hairline)',
        borderLeft: '2px solid var(--live)',
        color: 'var(--text-default)',
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{
          background: 'var(--live)',
          animation: 'mb-pulse 1.5s ease-in-out infinite',
        }}
      />
      <span>
        Writing in{' '}
        <button
          onClick={() => navigate({ kind: 'article', slug: writingTo, path: `wiki/notes/${writingTo}.md` })}
          className="underline-offset-2 hover:underline cursor-pointer"
          style={{ color: 'var(--accent)', fontWeight: 500 }}
        >
          [[{writingTo}]]
        </button>
        …
      </span>
    </div>
  );
}
