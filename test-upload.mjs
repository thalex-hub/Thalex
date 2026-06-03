import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import fs from 'fs';
import { Buffer } from 'buffer';

const firebaseConfig = {
  projectId: 'gen-lang-client-0900315510',
  storageBucket: 'gen-lang-client-0900315510.firebasestorage.app'
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function upload() {
  const fileRef = ref(storage, `payment_requests/test_up_${Date.now()}_Ảnh.txt`);
  const data = new Uint8Array(Buffer.from('Hello Firebase'));
  
  try {
     await uploadBytes(fileRef, data);
     console.log("Upload Success");
     const url = await getDownloadURL(fileRef);
     console.log("URL:", url);
     
     console.log("Fetching it now with Node fetch...");
     const r = await fetch(url);
     console.log("Fetch status:", r.status);
  } catch(e) {
     console.error(e);
  }
}
upload();
