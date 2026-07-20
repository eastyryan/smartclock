import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { readSession } from '@/lib/session';

export const maxDuration = 60;

/** Photos only. `file.type` is client-supplied, so this is a guardrail, not proof. */
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i;
const MAX_FILES = 12;
const MAX_BYTES_PER_FILE = 15 * 1024 * 1024;

/**
 * Drive folder names are interpolated into a `q=` query string, so they are
 * sanitised to a known-safe charset and then escaped. Previously only single
 * quotes were escaped, leaving backslashes unhandled — enough to break out of
 * the quoted literal and alter the query.
 */
function safeFolderName(raw: string): string {
  return raw.replace(/[^\w \-().&,']/g, '').trim().slice(0, 120);
}

function escapeDriveLiteral(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1Ti1J4j3ltPWFO9pZGqaSsorcs_44rpO9';

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const escaped = escapeDriveLiteral(name);
  const query = "name='" + escaped + "' and mimeType='application/vnd.google-apps.folder' and '" + parentId + "' in parents and trashed=false";

  const res = await drive.files.list({
    q: query,
    fields: 'files(id,name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0 && res.data.files[0].id) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!folder.data.id) {
    throw new Error('Failed to create folder: ' + name);
  }

  return folder.data.id;
}

export async function POST(request: Request) {
  // This endpoint was completely unauthenticated: anyone who found the URL could
  // write arbitrary files, and arbitrary folders, into the company Drive.
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Enter your PIN to upload photos.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const siteName = formData.get('siteName');
    // Optional overrides used by the End-of-Day broken/damaged flow.
    const folderNameRaw = formData.get('folderName');
    const filenameBaseRaw = formData.get('filenameBase');
    const folderName = safeFolderName(
      typeof folderNameRaw === 'string' && folderNameRaw
        ? folderNameRaw
        : typeof siteName === 'string'
          ? siteName
          : ''
    );
    const filenameBaseInput =
      typeof filenameBaseRaw === 'string' && filenameBaseRaw ? safeFolderName(filenameBaseRaw) : null;
    const filenameBase = filenameBaseInput || null;

    // Attribution comes from the session, not the payload, so an upload cannot
    // be filed under someone else's name.
    const employeeName = session.name;

    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    const notes = files.map((_, i) => {
      const v = formData.get('note_' + i);
      return typeof v === 'string' ? v.trim().slice(0, 500) : '';
    });

    if (!folderName || files.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many photos at once (max ${MAX_FILES}).` }, { status: 413 });
    }
    for (const f of files) {
      if (f.size > MAX_BYTES_PER_FILE) {
        return NextResponse.json({ error: `"${f.name}" is too large (max 15 MB).` }, { status: 413 });
      }
      if (f.type && !ALLOWED_MIME.test(f.type)) {
        return NextResponse.json({ error: 'Only photos can be uploaded.' }, { status: 415 });
      }
    }

    const targetFolderId = await findOrCreateFolder(folderName, ROOT_FOLDER_ID);

    const today = new Date().toISOString().split('T')[0];

    const uploadedFiles = await Promise.all(files.map(async (file, i) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      // Extension comes from the client filename, so keep it to a known set.
      const rawExt = (file.name.split('.').pop() || '').toLowerCase();
      const ext = /^(jpe?g|png|webp|heic|heif)$/.test(rawExt) ? rawExt : 'jpg';
      const indexSuffix = files.length > 1 ? '_' + (i + 1) : '';
      const baseName = filenameBase
        ? filenameBase + indexSuffix
        : today + '_' + employeeName + '_photo_' + (i + 1);
      const fileName = baseName + '.' + ext;
      const note = notes[i];

      const uploaded = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [targetFolderId],
          ...(note ? { description: note } : {}),
        },
        media: {
          mimeType: file.type || 'image/jpeg',
          body: Readable.from(buffer),
        },
        fields: 'id,name,webViewLink',
        supportsAllDrives: true,
      });

      return {
        id: uploaded.data.id,
        name: uploaded.data.name,
        link: uploaded.data.webViewLink,
      };
    }));

    return NextResponse.json({
      success: true,
      folder: folderName,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
