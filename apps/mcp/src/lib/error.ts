// apps/mcp/src/lib/error.ts
export interface ToolErrorBody {
  ok: false;
  error: string;
  fix?: string;
  details?: Record<string, unknown>;
}

export interface ToolSuccessBody<T = unknown> {
  ok: true;
  result: T;
}

/** Wrap result as MCP tool response (text content). */
export function textResult(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Wrap an error as MCP tool response with isError flag. */
export function errorResult(error: string, fix?: string, details?: Record<string, unknown>):
  { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const body: ToolErrorBody = { ok: false, error };
  if (fix) body.fix = fix;
  if (details) body.details = details;
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    isError: true,
  };
}

/** Wrap success payload uniformly. */
export function successResult<T>(result: T) {
  return textResult({ ok: true, result } satisfies ToolSuccessBody<T>);
}
