import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
async function findOrCreateFolder(name, parentId) {
  const query = parentId
    ? "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and '" + parentId + "' in parents and trashed=false"
    : "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false";

  const res = await drive.files.list({ q: query, fields: 'files(id,name)', spaces: 'drive' });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  });

  return folder.data.id;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const siteName = formData.get('siteName');
    const employeeName = formData.get('employeeName');
    const files = formData.getAll('files');

    if (!siteName || !employeeName || files.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const masterFolderId = await findOrCreateFolder('Dean Ryan App Photos');
    const siteFolderId = await findOrCreateFolder(siteName, masterFolderId);

    const today = new Date().toISOString().split('T')[0];
    const uploadedFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = today + '_' + employeeName + '_photo_' + (i + 1) + '.' + ext;

      const uploaded = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [siteFolderId],
        },
        media: {
          mimeType: file.type || 'image/jpeg',
          body: Readable.from(buffer),
        },
        fields: 'id,name,webViewLink',
      });

      uploadedFiles.push({
        id: uploaded.data.id,
        name: uploaded.data.name,
        link: uploaded.data.webViewLink,
      });
    }

    return NextResponse.json({
      success: true,
      folder: 'Dean Ryan App Photos/' + siteName,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
