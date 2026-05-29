import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';

const config = {
  projectId: 'gen-lang-client-0900315510',
  apiKey: 'AIzaSyDps7nJUHKERsYDY2g5NjPsbeFPeVf4Als',
  authDomain: 'gen-lang-client-0900315510.firebaseapp.com',
  storageBucket: 'gen-lang-client-0900315510.firebasestorage.app',
};

const app = initializeApp(config);
const db = getFirestore(app, 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7');

async function check() {
  const userRef = doc(db, 'users', 'caothang_thalex_vn');
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    console.log("Found user doc for config:", snap.data());
  } else {
    console.log("No user doc found for caothang_thalex_vn");
  }
}

check().then(() => process.exit(0)).catch(console.error);
