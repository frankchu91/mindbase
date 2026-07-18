export const definition = {
  name: 'connect',
  description: 'Find surprising connections in my wiki.',
  arguments: [],
};
export const template = `Find surprising connections in my wiki.

Use list_recent (last 14 days) to find recently ingested pages.
For each, use find_related (depth 2) to discover what it connects to.

Surface 3-5 connections that:
- Cross category boundaries (concept ↔ entity, etc.)
- Are between pages that don't currently link to each other
- Would be valuable to formalize as wikilinks

Format each connection as: "[[A]] ↔ [[B]] — what this reveals: ..."`;
