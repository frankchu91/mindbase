import { Sparkles, RotateCw, Inbox, Network } from 'lucide-react';

interface ChatEmptyStateProps {
  onPick: (prefill: string) => void;
}

const SUGGESTIONS: { icon: React.ReactNode; title: string; sub: string; prefill: string }[] = [
  {
    icon: <Sparkles size={14} strokeWidth={1.8} />,
    title: 'Ask about my wiki',
    sub: 'Query anything compiled from your sources',
    prefill: 'What does my wiki say about ',
  },
  {
    icon: <RotateCw size={14} strokeWidth={1.8} />,
    title: 'Continue last thread',
    sub: 'Pick up where you left off',
    prefill: '',
  },
  {
    icon: <Inbox size={14} strokeWidth={1.8} />,
    title: 'Synthesize from inbox',
    sub: 'Turn unprocessed sources into wiki pages',
    prefill: '/synthesize inbox',
  },
  {
    icon: <Network size={14} strokeWidth={1.8} />,
    title: 'Find related',
    sub: 'Surface connections you might have missed',
    prefill: 'Find pages related to ',
  },
];

export function ChatEmptyState({ onPick }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-col gap-3 py-4" data-testid="chat-empty-state">
      <div
        className="mb-1"
        style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}
      >
        <strong style={{ color: 'var(--text-high)', fontWeight: 600 }}>Start a thread</strong> — ask
        a question, drop a link, or pick a starter below.
      </div>
      {SUGGESTIONS.map((s, i) => (
        <button
          key={i}
          onClick={() => onPick(s.prefill)}
          className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left cursor-pointer"
          style={{
            border: '0.5px solid var(--hairline)',
            background: 'var(--bg-2)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
        >
          <span style={{ color: 'var(--text-mid)', marginTop: 1 }}>{s.icon}</span>
          <span className="flex-1 min-w-0">
            <span className="block" style={{ fontSize: 13, color: 'var(--text-default)', fontWeight: 500 }}>{s.title}</span>
            <span className="block mt-0.5" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{s.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
