import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';

const rawConfig = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const config = JSON.parse(rawConfig);

initializeApp({
  storageBucket: config.storageBucket
});

async function list() {
  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix: 'payment_requests/' });
  console.log('Files:');
  files.forEach(f => {
    console.log(f.name);
  });
}
list().catch(console.error);
