// EventSource only supports GET, so we open a POST with fetch and parse SSE
// from the body via the Streams API. Server-side mutations already written
// to disk are NOT rolled back on cancel — that's an explicit product decision.

export type CompileEvent =
  | { type: 'status'; payload: { text: string } }
  | { type: 'candidates'; payload: { items: Array<{ slug: string; title: string; similarity: number }> } }
  | { type: 'tool_start'; payload: { name: string; slug?: string; iteration?: number } }
  | { type: 'tool_done'; payload: { name: string; slug?: string; ok: boolean; error?: string } }
  | { type: 'complete'; payload: { summary: string; navigateTo?: { slug: string; path: string }; tokensUsed: { input: number; output: number }; durationMs: number } }
  | { type: 'error'; payload: { message: string } };

export interface StreamCompileHandle {
  cancel: () => void;
  done: Promise<void>;
}

export function streamCompileNote(
  slug: string,
  onEvent: (event: CompileEvent) => void,
): StreamCompileHandle {
  const ctl = new AbortController();
  const done = (async () => {
    let response: Response;
    try {
      response = await fetch(`/api/compile/note/${encodeURIComponent(slug)}/stream`, {
        method: 'POST',
        headers: { 'Accept': 'text/event-stream' },
        signal: ctl.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      onEvent({ type: 'error', payload: { message: (e as Error).message } });
      return;
    }
    if (!response.ok || !response.body) {
      onEvent({ type: 'error', payload: { message: `HTTP ${response.status}` } });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        onEvent({ type: 'error', payload: { message: (e as Error).message } });
        return;
      }
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let evType = '';
        let evData = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) evType = line.slice('event: '.length).trim();
          else if (line.startsWith('data: ')) evData += line.slice('data: '.length);
        }
        if (!evType) continue;
        try {
          const payload = JSON.parse(evData) as unknown;
          onEvent({ type: evType as CompileEvent['type'], payload } as CompileEvent);
        } catch {
          /* malformed event — skip */
        }
      }
    }
  })();
  return { cancel: () => ctl.abort(), done };
}
