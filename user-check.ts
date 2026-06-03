import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const rawConfig = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const config = JSON.parse(rawConfig);
const app = initializeApp(config);
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true
}, config.firestoreDatabaseId?.trim());

async function check() {
  const users = await getDocs(collection(db, 'users'));
  const userList = users.docs.map(d => d.data());
  console.log("Users:", userList.map(u => ({ email: u.email, name: u.fullName })));
  
  const cols = ['payment_requests', 'advance_requests', 'reimbursement_requests', 'order_proposals', 'leave_requests'];
  for (const col of cols) {
      const docs = await getDocs(collection(db, col));
      docs.forEach(d => {
          const data = d.data();
          if (data.userName === 'Huỳnh Công Tiến' || data.fullName === 'Huỳnh Công Tiến' || data.userName === 'Cao Duy Thắng' || data.fullName === 'Cao Duy Thắng') {
              console.log(`Found request in ${col}:`, data.userName || data.fullName, data.status, data.title || data.name || "no-title", data.purpose || data.reason || "no-reason");
          }
      });
  }
}
check().then(() => process.exit(0)).catch(console.error);
