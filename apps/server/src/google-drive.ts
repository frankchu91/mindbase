import { google } from 'googleapis';
import type { AtlasConfig } from './config';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const REDIRECT_URI = 'http://localhost:4321/api/google/auth/callback';

export function createOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
  }
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expiry: string;
}> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google');
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString(),
  };
}

/** Get an authenticated Drive client, refreshing token if expired */
export async function getDriveClient(config: AtlasConfig, saveConfig: (c: AtlasConfig) => Promise<void>) {
  const tokens = config.googleTokens;
  if (!tokens) throw new Error('Google Drive not connected');

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  // Check if token is expired
  if (new Date(tokens.expiry) <= new Date()) {
    const { credentials } = await client.refreshAccessToken();
    const updated: AtlasConfig = {
      ...config,
      googleTokens: {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token ?? tokens.refresh_token,
        expiry: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString(),
      },
    };
    await saveConfig(updated);
    client.setCredentials(credentials);
  }

  return google.drive({ version: 'v3', auth: client });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  isFolder: boolean;
  size?: string;
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function listFiles(
  config: AtlasConfig,
  saveConfig: (c: AtlasConfig) => Promise<void>,
  folderId: string = 'root',
): Promise<DriveFile[]> {
  const drive = await getDriveClient(config, saveConfig);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    orderBy: 'folder,name',
    pageSize: 100,
  });

  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime!,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    size: f.size ?? undefined,
  }));
}

export function isSupported(mimeType: string): boolean {
  return mimeType === 'application/vnd.google-apps.folder' || SUPPORTED_MIME_TYPES.has(mimeType);
}

export interface DownloadResult {
  text: string;
  binary?: Buffer;
  binaryExt?: string;
}

/** Download or export file content as text, and optionally the raw binary for PDF/DOCX */
export async function downloadFileContent(
  config: AtlasConfig,
  saveConfig: (c: AtlasConfig) => Promise<void>,
  fileId: string,
  mimeType: string,
): Promise<DownloadResult> {
  const drive = await getDriveClient(config, saveConfig);

  // Google Docs/Sheets/Slides — use export (no binary saved for native types)
  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { text: res.data as string };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' });
    return { text: res.data as string };
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
    return { text: res.data as string };
  }

  // PDF — download as arraybuffer, extract text, also keep binary
  if (mimeType === 'application/pdf') {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const binary = Buffer.from(res.data as ArrayBuffer);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(res.data as ArrayBuffer) }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it) => ('str' in it ? (it as { str: string }).str : '')).join(' ');
      parts.push(text);
    }
    return { text: parts.join('\n\n'), binary, binaryExt: 'pdf' };
  }

  // DOCX — download as arraybuffer, extract text, also keep binary
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const binary = Buffer.from(res.data as ArrayBuffer);
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: binary });
    return { text: result.value, binary, binaryExt: 'docx' };
  }

  // Plain text / markdown — download as text (no binary)
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return { text: res.data as string };
}
