import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, PanelRightClose } from 'lucide-react';
import { useShellState, CHAT_WIDTH_BOUNDS } from '../../store/shell-state';
import { useChat } from '../../store/chat';
import { useSettings } from '../../store/settings';
import { ChatView } from '../ChatView';
import { ChatInputShell } from './ChatInputShell';
import { ChatEmptyState } from './ChatEmptyState';
import { LiveEditIndicator } from './LiveEditIndicator';

interface ChatPaneProps {
  chatTitle: string;
  onNewChat: () => void;
  onWikiSaved: () => void;
  onOpenArticle: (slug: string, path: string) => void;
  onOpenReview: () => void;
}

export function ChatPane({
  chatTitle,
  onNewChat,
  onWikiSaved,
  onOpenArticle,
  onOpenReview,
}: ChatPaneProps) {
  const chatWidth = useShellState((s) => s.chatWidth);
  const setChatWidth = useShellState((s) => s.setChatWidth);
  const focusMode = useShellState((s) => s.focusMode);
  const { messages } = useChat();
  const model = useSettings((s) => s.model);
  const [draft, setDraft] = useState('');
  const sendFnRef = useRef<((text: string) => Promise<void>) | null>(null);

  const registerSend = useCallback((fn: (text: string) => Promise<void>) => {
    sendFnRef.current = fn;
  }, []);

  // Drag-resize logic (refs declared up here so cleanup effect can see onMove/onUp)
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(chatWidth);

  function onMove(e: MouseEvent) {
    if (!dragging.current) return;
    // Handle is on chat's LEFT edge: dragging left (negative dx) makes chat WIDER.
    const dx = e.clientX - startX.current;
    setChatWidth(startW.current - dx);
  }
  function onUp() {
    dragging.current = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  useEffect(() => () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }, []);

  if (focusMode) return null;

  function handleSend() {
    const text = draft.trim();
    if (!text || !sendFnRef.current) return;
    setDraft('');
    void sendFnRef.current(text);
  }

  function startResize(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = chatWidth;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <section
      data-testid="chat-pane"
      className="flex-shrink-0 flex flex-col relative"
      style={{
        width: chatWidth,
        minWidth: CHAT_WIDTH_BOUNDS.min,
        maxWidth: CHAT_WIDTH_BOUNDS.max,
        background: 'var(--chat-bg)',
        borderLeft: '0.5px solid var(--hairline)',
      }}
    >
      <div
        className="flex-shrink-0 px-4 py-2.5 flex items-center gap-2"
        style={{ borderBottom: '0.5px solid var(--hairline)' }}
      >
        <div
          className="flex-1 min-w-0 truncate"
          style={{ fontSize: '12.5px', color: 'var(--text-mid)', fontWeight: 600 }}
          data-testid="chat-breadcrumb"
        >
          {chatTitle}
        </div>
        <HeadBtn onClick={onNewChat} title="New thread"><Plus size={13} strokeWidth={1.8} /></HeadBtn>
        <HeadBtn onClick={useShellState.getState().toggleChatCollapsed} title="Collapse chat (⌘L)"><PanelRightClose size={13} strokeWidth={1.8} /></HeadBtn>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <LiveEditIndicator />
        {messages.length === 0 ? (
          <ChatEmptyState onPick={(prefill) => setDraft(prefill)} />
        ) : (
          <ChatView
            chrome="off"
            chatTitle={chatTitle}
            onNewChat={onNewChat}
            onWikiSaved={onWikiSaved}
            onOpenArticle={onOpenArticle}
            onOpenReview={onOpenReview}
            registerSend={registerSend}
          />
        )}
      </div>

      <ChatInputShell
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        modelName={model}
      />

      {/* Drag-resize handle — on chat's LEFT edge (between Canvas/RightRail and Chat),
          invisible until hover. */}
      <div
        className="absolute top-0 bottom-0 cursor-col-resize z-10 group/resize"
        style={{ left: -3, width: 6 }}
        onMouseDown={startResize}
        data-testid="chat-resize-handle"
      >
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 transition-opacity opacity-0 group-hover/resize:opacity-100"
          style={{ width: 2, background: 'var(--accent)' }}
        />
      </div>
    </section>
  );
}

function HeadBtn({ onClick, children, title }: { onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded cursor-pointer"
      style={{ color: 'var(--text-mid)', background: 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--row-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}
