import admin from 'firebase-admin';

async function testDownload() {
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
  const file = bucket.file('payment_requests/1780403357150_Ảnh màn hình 2026-06-02 lúc 19.21.40.png');
  
  try {
    const [exists] = await file.exists();
    console.log("Exists:", exists);
    if (exists) {
        const [buffer] = await file.download();
        console.log("Downloaded bytes:", buffer.length);
    }
  } catch(e) {
      console.error(e);
  }
}

testDownload();
