import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const rawConfig = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  const collections = ['payment_requests', 'reimbursement_requests', 'advance_requests'];
  for (const col of collections) {
    const snap = await getDocs(collection(db, col));
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.status === 'pending' || data.status === 'pending_director' || data.status === 'pending_finance' || !data.status) {
         console.log(col, d.id, "title:", data.title, "purpose:", data.purpose, "status:", data.status);
      }
    });
  }
}
check().catch(console.error);
