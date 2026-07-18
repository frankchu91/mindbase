import { useState, useRef, useEffect } from 'react';
import { FileText, Search, PlayCircle, Zap, type LucideIcon } from 'lucide-react';
import { useChat } from '../store/chat';
import { ChatMessage } from './ChatMessage';
import { apiSSE, apiPost, apiPostFile } from '../lib/api';
import type { QAEvent } from '@mindbase/core';
import { PulseHome } from './PulseHome';

type InputMode = 'chat' | 'ingest';

interface ChatViewProps {
  onWikiSaved?: () => void;
  chatTitle: string;
  onNewChat: () => void;
  onOpenArticle?: (slug: string, path: string) => void;
  onOpenReview: () => void;
  chrome?: 'on' | 'off';
  // When chrome='off' an external input drives the chat; expose imperative send.
  registerSend?: (fn: (text: string) => Promise<void>) => void;
}

export function ChatView({ onWikiSaved, chatTitle, onNewChat, onOpenArticle, onOpenReview, chrome, registerSend }: ChatViewProps) {
  const { messages, addUser, addAssistant, appendDelta, addProgress, setSources, finish, fail } = useChat();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<InputMode>('chat');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [autoSaveTitles, setAutoSaveTitles] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chrome !== 'off' || !registerSend) return;
    registerSend(async (text: string) => {
      if (!text.trim()) return;
      if (text.startsWith('/ingest ')) {
        await handleIngest(text.slice('/ingest '.length).trim());
      } else {
        await handleSubmit(text);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome, registerSend]);

  function exitIngestMode() {
    setMode('chat');
    setInput('');
    inputRef.current?.focus();
  }

  async function handleIngest(text: string) {
    setBusy(true);
    setMode('chat');
    addUser(`/ingest ${text.length > 80 ? text.slice(0, 80) + '...' : text}`);
    const asstId = addAssistant();
    addProgress(asstId, 'Ingesting...');

    try {
      const ingestRes = await apiPost<{ ok: boolean; rawId?: string; title?: string; kind?: string; error?: string }>(
        '/ingest/text',
        { text },
      );
      if (!ingestRes.ok) throw new Error(ingestRes.error ?? 'ingest failed');

      addProgress(asstId, `Saved as raw/${ingestRes.rawId}. Compiling...`);

      const compileRes = await apiPost<{ ok: boolean; error?: string }>(
        `/compile/${ingestRes.rawId}`,
        {},
      );

      if (compileRes.ok) {
        appendDelta(asstId, `Ingested and compiled "${ingestRes.title ?? 'Untitled'}" (${ingestRes.kind ?? 'text'}).`);
      } else {
        appendDelta(asstId, `Ingested but compile failed: ${compileRes.error ?? 'unknown error'}`);
      }
      finish(asstId, []);
      onWikiSaved?.();
    } catch (e) {
      fail(asstId, (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileIngest(file: File) {
    setBusy(true);
    setMode('chat');
    addUser(`/ingest 📎 ${file.name}`);
    const asstId = addAssistant();
    addProgress(asstId, `Uploading ${file.name}...`);

    try {
      const ingestRes = await apiPostFile<{ ok: boolean; rawId?: string; title?: string; error?: string }>(
        '/ingest/file',
        file,
      );
      if (!ingestRes.ok) throw new Error(ingestRes.error ?? 'ingest failed');

      addProgress(asstId, `Saved. Compiling...`);

      const compileRes = await apiPost<{ ok: boolean; error?: string }>(
        `/compile/${ingestRes.rawId}`,
        {},
      );

      if (compileRes.ok) {
        appendDelta(asstId, `Ingested and compiled "${ingestRes.title ?? file.name}".`);
      } else {
        appendDelta(asstId, `Ingested but compile failed: ${compileRes.error ?? 'unknown'}`);
      }
      finish(asstId, []);
      onWikiSaved?.();
    } catch (e) {
      fail(asstId, (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleInputChange(value: string) {
    // Detect /ingest typed in chat mode
    if (mode === 'chat' && value === '/ingest') {
      setMode('ingest');
      setInput('');
      return;
    }
    if (mode === 'chat' && value === '/ingest ') {
      setMode('ingest');
      setInput('');
      return;
    }
    setInput(value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && mode === 'ingest') {
      exitIngestMode();
      return;
    }
    if (e.key === 'Backspace' && mode === 'ingest' && input === '') {
      exitIngestMode();
      return;
    }
    if (e.key === 'Enter') {
      send();
    }
  }

  async function handleSubmit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    addUser(q);
    const asstId = addAssistant();
    const history = messages
      .filter((m) => m.status === 'done' && m.text)
      .map((m) => ({ role: m.role, text: m.text }));
    apiSSE('/ask', { question: q, history }, (event) => {
      const e = event as QAEvent & { title?: string };
      switch (e.kind) {
        case 'progress':
          addProgress(asstId, `${e.phase}${e.detail ? `: ${e.detail}` : ''}`);
          break;
        case 'sources':
          setSources(asstId, e.sources);
          break;
        case 'delta':
          appendDelta(asstId, e.text);
          break;
        case 'done':
          finish(asstId, e.citations ?? [], e.sources);
          setBusy(false);
          break;
        case 'error':
          fail(asstId, e.error);
          setBusy(false);
          break;
        default:
          if ((e as { kind: string }).kind === 'auto_saved') {
            setAutoSaveTitles((prev) => ({ ...prev, [asstId]: (e as { title?: string }).title ?? '' }));
            onWikiSaved?.();
          }
          break;
      }
    });
  }

  function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    if (mode === 'ingest') {
      setMode('chat');
      handleIngest(q);
      return;
    }
    void handleSubmit(q);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileIngest(file);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileIngest(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center text-lg font-medium rounded-xl"
          style={{ background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)' }}
        >
          Drop file to ingest
        </div>
      )}

      {/* Chat header */}
      {chrome !== 'off' && (
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>💬 {chatTitle}</div>
          <button
            onClick={onNewChat}
            className="text-xs px-3 py-1 rounded-md transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >+ New</button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-6 py-4">
          {messages.length === 0 && chrome !== 'off' ? (
            <PulseHome
              onOpenArticle={onOpenArticle ?? (() => {})}
              onOpenReview={onOpenReview}
            />
          ) : (
            messages.map((m) => <ChatMessage key={m.id} msg={m} onWikiSaved={onWikiSaved} autoSaveTitle={autoSaveTitles[m.id] ?? null} onOpenArticle={onOpenArticle} />)
          )}
        </div>
      </div>

      {chrome !== 'off' && (
        <div className="px-6 pb-6">
          <div className="max-w-[680px] mx-auto">
            <div
              className="flex items-center gap-2 rounded-[14px] glass-card pl-4 pr-1 py-1"
              style={{
                border: `1px solid ${mode === 'ingest' ? 'var(--border-focus)' : 'var(--border-strong)'}`,
              }}
            >
              {mode === 'ingest' && (
                <div className="flex items-center gap-1 pl-3 shrink-0">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    /ingest
                  </span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs px-2 py-0.5 rounded-md"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    title="Upload file"
                  >
                    📎
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'ingest'
                    ? 'Paste URL, text, or click 📎 for file... (Esc to cancel)'
                    : 'Ask a question, or type /ingest...'
                }
                className="flex-1 px-4 py-3 text-sm outline-none bg-transparent"
                style={{ color: 'var(--text-primary)' }}
                disabled={busy}
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="w-8 h-8 rounded-[9px] flex items-center justify-center font-semibold disabled:opacity-40 shrink-0 text-base"
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: 'var(--text-inverse)',
                }}
              >
                {busy ? '…' : '↑'}
              </button>
            </div>
            <div className="mt-2 text-[10.5px] pl-1" style={{ color: 'var(--text-low)' }}>
              ⌘ ↵ to send · /ingest to add a source · drag a file to attach
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".md,.txt,.pdf" onChange={handleFilePick} className="hidden" />
    </div>
  );
}
