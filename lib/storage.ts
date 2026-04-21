import { adminStorage } from '@/lib/firebase-admin';

/**
 * Upload a file buffer to Firebase Storage and return a public URL.
 * Uses signed URLs valid for 7 days so WhatsApp can download the doc.
 */
export async function uploadReportPdf(
  buffer: Buffer,
  filename: string,
): Promise<{ url: string; path: string }> {
  const bucket = adminStorage.bucket();
  const path = `reports/${filename}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'private, max-age=0',
    },
    resumable: false,
  });

  // Signed URL valid for 7 days
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { url, path };
}

export async function deleteReport(path: string) {
  try {
    await adminStorage.bucket().file(path).delete();
  } catch {
    // swallow — file may already be gone
  }
}
