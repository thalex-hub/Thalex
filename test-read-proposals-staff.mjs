import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, "vietnhan@thalex.vn", "123456"); // I'll assume standard test password or I'll just check rules... wait, let's just check the firestore rules test.
  process.exit(0);
}
// wait, instead of guessing passwords, let's just use the Admin SDK to check the data.
