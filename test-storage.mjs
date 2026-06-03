import admin from 'firebase-admin';

async function testUploadAndDownload() {
  let db;
  try {
    const config = { projectId: 'gen-lang-client-0900315510' };
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...config,
      storageBucket: 'gen-lang-client-0900315510.firebasestorage.app'
    });
  } catch (err) {
    console.error("Admin init failed:", err);
    return;
  }
  
  const bucket = admin.storage().bucket();
  const file = bucket.file('test_Ảnh_123.txt');
  await file.save('Hello world!');
  console.log("File saved!");
  
  // Let's generate a signed URL (this is what Admin SDK does, but Frontend uses getting download token)
  const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
  console.log("Signed URL:", signedUrl);
  
  // Try fetching it
  const res = await fetch(signedUrl);
  console.log("Status from fetch:", res.status);
}

testUploadAndDownload();
