// apps/web/src/components/AiClientsSetup.tsx
import { useState } from 'react';

const CONFIG_JSON = `{
  "mcpServers": {
    "mindbase": {
      "command": "npx",
      "args": ["-y", "@mindbase/mcp-server"]
    }
  }
}`;

export function AiClientsSetup() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(CONFIG_JSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="text-[10.5px] tracking-[1px] uppercase font-semibold mb-1.5" style={{ color: 'var(--text-mid)' }}>
        Connect to AI clients
      </div>
      <div className="text-[11px] mb-2.5" style={{ color: 'var(--text-low)' }}>
        Use MindBase from Claude Desktop, Cursor, Windsurf, Cline, or Claude Code.
      </div>

      <pre
        className="text-[10.5px] font-mono p-2.5 rounded-md whitespace-pre overflow-x-auto"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', color: 'var(--text-default)' }}
      >
{CONFIG_JSON}
      </pre>

      <div className="flex gap-2 mt-2">
        <button
          onClick={copy}
          className="text-[10.5px] px-2.5 py-1.5 rounded-md font-medium"
          style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--text-inverse)' }}
        >
          {copied ? '✓ Copied' : '📋 Copy config'}
        </button>
        <a
          href="https://github.com/frankchu91/mindbase/blob/main/apps/mcp/README.md"
          target="_blank"
          rel="noreferrer"
          className="text-[10.5px] px-2.5 py-1.5 rounded-md inline-flex items-center"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-default)' }}
        >📖 Setup guide</a>
      </div>

      <div className="text-[10.5px] mt-3" style={{ color: 'var(--text-low)' }}>
        Compatible with:
      </div>
      <ul className="text-[10.5px] mt-1 space-y-0.5" style={{ color: 'var(--text-mid)' }}>
        <li>· Claude Desktop</li>
        <li>· Cursor</li>
        <li>· Windsurf</li>
        <li>· Cline</li>
        <li>· Claude Code</li>
      </ul>
    </div>
  );
}
