import { userInfo } from 'node:os';

export function resolveUser(req: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers['x-mindbase-user'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return userInfo().username;
}
