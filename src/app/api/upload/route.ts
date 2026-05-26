import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { Readable } from 'stream';

export const maxDuration = 60;

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
  const escaped = name.replace(/'/g, "\\'");
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
  try {
    const formData = await request.formData();
    const siteName = formData.get('siteName');
    const employeeName = formData.get('employeeName');
    // Optional overrides used by the End-of-Day broken/damaged flow.
    const folderNameRaw = formData.get('folderName');
    const filenameBaseRaw = formData.get('filenameBase');
    const folderName = typeof folderNameRaw === 'string' && folderNameRaw ? folderNameRaw : (typeof siteName === 'string' ? siteName : '');
    const filenameBase = typeof filenameBaseRaw === 'string' && filenameBaseRaw ? filenameBaseRaw : null;
    const files = formData.getAll('files').filter((f): f is File => f instanceof File);
    const notes = files.map((_, i) => {
      const v = formData.get('note_' + i);
      return typeof v === 'string' ? v.trim() : '';
    });

    if (typeof employeeName !== 'string' || !folderName || files.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const targetFolderId = await findOrCreateFolder(folderName, ROOT_FOLDER_ID);

    const today = new Date().toISOString().split('T')[0];

    const uploadedFiles = await Promise.all(files.map(async (file, i) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop() || 'jpg';
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
