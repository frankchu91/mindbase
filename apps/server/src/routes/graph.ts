import { Router } from 'express';
import { graphToJSON, toGraphML, toCypher, graphToHTML } from '@mindbase/core';
import type { ServerContext } from '../context';

export function graphRoutes(ctx: ServerContext): Router {
  const router = Router();

  function parseExclude(query: Record<string, unknown>): Array<'public' | 'internal' | 'pii'> {
    const ev = query['excludeVisibility'];
    if (typeof ev !== 'string' || !ev) return [];
    return ev.split(',').filter((v): v is 'public' | 'internal' | 'pii' =>
      v === 'public' || v === 'internal' || v === 'pii');
  }

  router.get('/', async (req, res) => {
    try {
      // scope=all → unified graph spanning every project (no projectId filter).
      // scope=current (default) → current project view + outgoing cross-edges.
      const scope = req.query['scope'];
      const graphOpts = scope === 'all' ? {} : { projectId: ctx.currentProjectId };
      const graph = ctx.wikiIndex.buildGraph(graphOpts);
      const json = graphToJSON(graph, { excludeVisibility: parseExclude(req.query as Record<string, unknown>) });
      res.type('application/json').send(json);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/html', async (req, res) => {
    try {
      const graph = ctx.wikiIndex.buildGraph({ projectId: ctx.currentProjectId });
      const html = graphToHTML(graph, { excludeVisibility: parseExclude(req.query as Record<string, unknown>) });
      res.type('text/html').send(html);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/graphml', async (req, res) => {
    try {
      const graph = ctx.wikiIndex.buildGraph({ projectId: ctx.currentProjectId });
      const xml = toGraphML(graph, { excludeVisibility: parseExclude(req.query as Record<string, unknown>) });
      res.setHeader('Content-Disposition', 'attachment; filename="mindbase-graph.graphml"');
      res.type('application/xml').send(xml);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/cypher', async (req, res) => {
    try {
      const graph = ctx.wikiIndex.buildGraph({ projectId: ctx.currentProjectId });
      const cypher = toCypher(graph, { excludeVisibility: parseExclude(req.query as Record<string, unknown>) });
      res.setHeader('Content-Disposition', 'attachment; filename="mindbase-graph.cypher"');
      res.type('text/plain').send(cypher);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
