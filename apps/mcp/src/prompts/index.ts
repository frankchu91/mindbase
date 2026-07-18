// apps/mcp/src/prompts/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as dailyDigest from './daily-digest.js';
import * as brainstorm from './brainstorm.js';
import * as audit from './audit.js';
import * as connect from './connect.js';
import * as explain from './explain.js';
import * as quiz from './quiz.js';
import * as write from './write.js';

export function registerPrompts(server: Server): void {
  const prompts = [
    dailyDigest.definition,
    brainstorm.definition,
    audit.definition,
    connect.definition,
    explain.definition,
    quiz.definition,
    write.definition,
  ];

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, string>;

    const renderText = (): string => {
      switch (name) {
        case 'daily-digest': return dailyDigest.template;
        case 'brainstorm': return brainstorm.template(args['topic'] ?? '');
        case 'audit': return audit.template;
        case 'connect': return connect.template;
        case 'explain': return explain.template(args['slug'] ?? '');
        case 'quiz': return quiz.template;
        case 'write': return write.template(args['topic'] ?? '');
        default: throw new Error(`Unknown prompt: ${name}`);
      }
    };

    return {
      description: prompts.find((p) => p.name === name)?.description,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: renderText() },
        },
      ],
    };
  });
}
