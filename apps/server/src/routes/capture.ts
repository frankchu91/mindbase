import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';
import type { ServerContext } from '../context';
import type { DeviceStore, DeviceInfo } from '../lib/devices';
import type { Inbox, CaptureType } from '../lib/inbox';
import type { CaptureSurface } from '@mindbase/core';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const VALID_CAPTURE_TYPES: readonly CaptureType[] = ['url', 'text', 'image', 'audio'];

const VALID_CAPTURE_SURFACES: readonly CaptureSurface[] = [
  'browser-ext',
  'ios',
  'android',
  'voice',
  'manual',
];

/**
 * MIME → file extension mapping for audio and image capture types.
 * Falls back to '.bin' for unknown/unlisted MIME types.
 */
const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

function resolveExt(captureType: CaptureType, mimeType: string | undefined): string {
  const mime = (mimeType ?? '').toLowerCase();
  if (captureType === 'audio') {
    const ext = AUDIO_MIME_TO_EXT[mime];
    if (!ext) {
      console.warn(`[capture] unknown audio MIME type "${mimeType}", using .bin`);
      return 'bin';
    }
    return ext;
  }
  // image
  const ext = IMAGE_MIME_TO_EXT[mime];
  if (!ext) {
    console.warn(`[capture] unknown image MIME type "${mimeType}", using .bin`);
    return 'bin';
  }
  return ext;
}

// Extend the express Request type to carry the authenticated device.
interface AuthenticatedRequest extends Request {
  device: DeviceInfo;
}

export function captureRoutes(ctx: ServerContext, devices: DeviceStore, inbox: Inbox): Router {
  const router = Router();

  async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'missing token' });
      return;
    }
    const dev = await devices.verify(auth.slice(7));
    if (!dev) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    (req as AuthenticatedRequest).device = dev;
    next();
  }

  router.post(
    '/',
    authMiddleware,
    upload.single('file'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const body: {
          type?: string;
          url?: string;
          title?: string;
          text?: string;
          note?: string;
          tags?: string[];
          project?: string;
          captured_at?: string;
          captured_via?: string;
          captured_device_id?: string;
          client_dedup_key?: string;
          payload?: string;
        } = req.body.payload ? JSON.parse(req.body.payload as string) : req.body;

        // Validate capture type
        if (!body.type || !VALID_CAPTURE_TYPES.includes(body.type as CaptureType)) {
          res.status(400).json({
            error: `"type" must be one of: ${VALID_CAPTURE_TYPES.join(', ')}`,
          });
          return;
        }
        const captureType = body.type as CaptureType;

        // Validate captured_via — required for proper provenance
        if (!body.captured_via) {
          res.status(400).json({ error: '"captured_via" is required' });
          return;
        }
        if (!VALID_CAPTURE_SURFACES.includes(body.captured_via as CaptureSurface)) {
          res.status(400).json({
            error: `"captured_via" must be one of: ${VALID_CAPTURE_SURFACES.join(', ')}`,
          });
          return;
        }
        const capturedVia = body.captured_via as CaptureSurface;

        const authedReq = req as AuthenticatedRequest;
        const id = ulid();
        let audio_path: string | undefined;
        let image_path: string | undefined;

        if (req.file) {
          if (captureType !== 'audio' && captureType !== 'image') {
            res.status(400).json({
              error: 'File upload is only allowed for "audio" and "image" capture types',
            });
            return;
          }
          const rawDir = join(ctx.dataDir, 'raw');
          await fs.mkdir(rawDir, { recursive: true });
          const ext = resolveExt(captureType, req.file.mimetype);
          const fp = join(rawDir, `${id}.${ext}`);
          await fs.writeFile(fp, req.file.buffer);
          if (captureType === 'audio') audio_path = fp;
          if (captureType === 'image') image_path = fp;
        }

        const result = await inbox.add({
          type: captureType,
          url: body.url,
          title: body.title,
          text: body.text,
          note: body.note,
          tags: body.tags,
          project: body.project,
          captured_at: body.captured_at ?? new Date().toISOString(),
          captured_via: capturedVia,
          captured_device_id: authedReq.device.id,
          audio_path,
          image_path,
          client_dedup_key: body.client_dedup_key,
        });

        res.json({ ...result, inbox_url: `/inbox/${result.id}` });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === 'duplicate') {
          res.status(409).json({ error: 'duplicate' });
          return;
        }
        res.status(500).json({ error: msg });
      }
    },
  );

  return router;
}
