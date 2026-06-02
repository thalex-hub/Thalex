import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import * as fs from 'fs';

const firebaseConfigOriginal = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfigOriginal);
const storage = getStorage(app);
const fileRef = ref(storage, 'test/test.txt');

console.log('Uploading...');
const buffer = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

uploadBytes(fileRef, buffer).then(() => {
  console.log('Upload success');
  process.exit(0);
}).catch(err => {
  console.error('Upload failed', err);
  process.exit(1);
});

setTimeout(() => {
  console.error('Upload timed out!');
  process.exit(1);
}, 5000);
