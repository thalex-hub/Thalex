import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, "vietnhan@thalex.vn", "123456");
  const user = auth.currentUser;
  console.log("Logged in as", user.uid);

  try {
    const q1 = query(collection(db, 'order_proposals'), where('createdBy', '==', user.uid));
    const snap1 = await getDocs(q1);
    console.log("q1 success, count:", snap1.size);
  } catch(e) {
    console.error("q1 error:", e.code, e.message);
  }

  try {
    const q2 = query(collection(db, 'order_proposals'), where('followers', 'array-contains', user.uid));
    const snap2 = await getDocs(q2);
    console.log("q2 success, count:", snap2.size);
  } catch(e) {
    console.error("q2 error:", e.code, e.message);
  }

  try {
    const q3 = query(collection(db, 'order_proposals'), orderBy('createdAt', 'desc'));
    const snap3 = await getDocs(q3);
    console.log("q3 success, count:", snap3.size);
  } catch(e) {
    console.error("q3 error:", e.code, e.message);
  }
}
run().catch(console.error).finally(() => process.exit());
