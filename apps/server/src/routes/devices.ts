import { Router, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import type { DeviceStore, DeviceInfo } from '../lib/devices';

const VALID_DEVICE_TYPES: readonly DeviceInfo['type'][] = [
  'ios',
  'android',
  'browser-ext',
  'desktop',
  'other',
];

export function devicesRoutes(devices: DeviceStore): Router {
  const router = Router();

  router.get('/pair-code', async (_req: Request, res: Response): Promise<void> => {
    try {
      const { code, expiresAt } = await devices.issuePairCode();
      const qrDataUrl = await QRCode.toDataURL(code);
      res.json({ code, expiresAt, qr: qrDataUrl });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/pair', async (req: Request, res: Response): Promise<void> => {
    try {
      const { code, device_name, device_type } = req.body as {
        code?: string;
        device_name?: string;
        device_type?: string;
      };

      if (!code?.trim()) {
        res.status(400).json({ error: '"code" is required' });
        return;
      }
      if (!device_name?.trim()) {
        res.status(400).json({ error: '"device_name" is required' });
        return;
      }
      if (!device_type) {
        res.status(400).json({ error: '"device_type" is required' });
        return;
      }
      if (!VALID_DEVICE_TYPES.includes(device_type as DeviceInfo['type'])) {
        res.status(400).json({
          error: `"device_type" must be one of: ${VALID_DEVICE_TYPES.join(', ')}`,
        });
        return;
      }

      const result = await devices.redeemPairCode(code.trim(), {
        name: device_name.trim(),
        type: device_type as DeviceInfo['type'],
      });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json({ devices: await devices.list() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'invalid id' });
        return;
      }
      await devices.revoke(id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
