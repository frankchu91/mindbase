import { Router } from 'express';
import type { ServerContext } from '../context';
import type { FileStore } from '@mindbase/core';
import { isValidSlug } from '../safe-path';

interface ChatSession {
  id: string;
  title: string;
  created: string;
  updated: string;
  messages: Array<{ role: string; text: string; citations?: Array<{ path: string; title: string }> }>;
}

export function chatRoutes(ctx: ServerContext): Router {
  const router = Router();

  // List all chat sessions
  router.get('/', async (_req, res) => {
    try {
      const entries = await ctx.store.listDir('chats');
      const sessions: Array<{ id: string; title: string; created: string; updated: string; messageCount: number }> = [];
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        try {
          const session = await ctx.store.readJSON<ChatSession>(`chats/${entry.name}`);
          sessions.push({
            id: session.id,
            title: session.title,
            created: session.created,
            updated: session.updated,
            messageCount: session.messages.length,
          });
        } catch { /* skip malformed */ }
      }
      // Sort by updated, newest first
      sessions.sort((a, b) => b.updated.localeCompare(a.updated));
      res.json({ sessions });
    } catch {
      res.json({ sessions: [] });
    }
  });

  // Get a specific chat session
  router.get('/:id', async (req, res) => {
    try {
      const id = req.params['id']!;
      if (!isValidSlug(id)) { res.status(400).json({ error: 'invalid id' }); return; }
      const session = await ctx.store.readJSON<ChatSession>(`chats/${id}.json`);
      res.json(session);
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  // Save/update a chat session
  router.put('/:id', async (req, res) => {
    try {
      const id = req.params['id']!;
      if (!isValidSlug(id)) { res.status(400).json({ ok: false, error: 'invalid id' }); return; }
      const session = req.body as ChatSession;
      session.id = id;
      session.updated = new Date().toISOString();
      if (!session.created) session.created = session.updated;
      if (!session.title && session.messages.length > 0) {
        const firstUser = session.messages.find((m) => m.role === 'user');
        session.title = firstUser?.text.slice(0, 60) ?? 'Untitled chat';
      }
      await ctx.store.writeJSON(`chats/${session.id}.json`, session);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // Delete a chat session — moves to trash so it shows under the Chats tab
  // of TrashView and is restorable. Falls back to hard remove if the underlying
  // store isn't a FileStore (e.g. memory store in tests).
  router.delete('/:id', async (req, res) => {
    try {
      const id = req.params['id']!;
      if (!isValidSlug(id)) { res.status(400).json({ ok: false, error: 'invalid id' }); return; }
      const path = `chats/${id}.json`;
      const fileStore = ctx.store as unknown as FileStore;
      if (typeof fileStore.moveToTrash === 'function') {
        const entry = await fileStore.moveToTrash([path]);
        res.json({ ok: true, trashEntryId: entry.id });
      } else {
        await ctx.store.remove(path);
        res.json({ ok: true });
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
