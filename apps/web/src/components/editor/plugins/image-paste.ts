/**
 * image-paste.ts
 *
 * Milkdown upload plugin configuration that intercepts paste/drop image files,
 * uploads them to /api/tree/attachments/upload, and inserts the markdown image node.
 *
 * Uses @milkdown/kit/plugin/upload's uploader interface.
 */

import type { Fragment, Node, Schema } from '@milkdown/kit/prose/model';
import type { Ctx } from '@milkdown/kit/ctx';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Chunked conversion so String.fromCharCode(...) doesn't blow the arg limit on large images.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function makeImageUploader(_slug: string) {
  return async (files: FileList, schema: Schema, _ctx: Ctx, _insertPos: number): Promise<Fragment | Node | Node[]> => {
    const results: Node[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || !ALLOWED_MIME.has(file.type)) continue;

      try {
        const data64 = await fileToBase64(file);
        const res = await fetch('/api/tree/attachments/upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: data64, mime: file.type }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error('[image-paste] upload failed:', err);
          continue;
        }

        const data = await res.json() as { url: string; filename: string };

        // Build a ProseMirror image node
        const imageNode = schema.nodes['image']?.createAndFill({
          src: data.url,
          alt: file.name || 'pasted',
          title: null,
        });

        if (imageNode) {
          results.push(imageNode);
        }
      } catch (e) {
        console.error('[image-paste] upload error:', e);
      }
    }

    // Return as a fragment or a single node
    if (results.length === 0) {
      // Nothing uploaded — return empty paragraph to not crash
      return schema.nodes['paragraph']?.createAndFill() ?? schema.topNodeType.createAndFill()!;
    }
    if (results.length === 1) return results[0]!;
    return schema.nodes['paragraph']?.createAndFill({}, results) ?? results[0]!;
  };
}
