import fs from 'fs';
import admin from 'firebase-admin';

// Initialize with application default credentials or just fake project? 
// Actually, admin SDK works if we provide the right projectId.
admin.initializeApp({
  projectId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7'
});

const db = admin.firestore();

async function run() {
  const users = await db.collection('users').get();
  let vietnhan = null;
  users.forEach(doc => {
    if (doc.data().email === 'vietnhan@thalex.vn') vietnhan = { id: doc.id, ...doc.data() };
  });
  console.log('vietnhan uid:', vietnhan?.id);

  const proposals = await db.collection('order_proposals').get();
  let found = 0;
  proposals.forEach(doc => {
    console.log(doc.id, doc.data().name, doc.data().createdBy, doc.data().followers);
    if (doc.data().createdBy === vietnhan?.id) {
      found++;
    }
  });
  console.log('Total proposals created by vietnhan:', found);
}
run().catch(console.error).finally(() => process.exit());
