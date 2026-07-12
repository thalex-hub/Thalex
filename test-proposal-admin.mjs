import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('/app/firebase-service-account.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const payload = {
    name: "Test Proposal 123",
    createdBy: "info.vinasglobal@gmail.com",
    createdAt: new Date().toISOString(),
    status: 'pending',
    followers: []
  };

  const docRef = await db.collection('order_proposals').add(payload);
  console.log("Created proposal", docRef.id);

  // monitor
  const unsub = db.collection('order_proposals').doc(docRef.id).onSnapshot(doc => {
    if (doc.exists) {
      console.log("Doc exists. Data:", doc.data());
    } else {
      console.log("Doc DOES NOT exist!");
    }
  });

  setTimeout(() => {
    unsub();
    console.log("Done.");
    process.exit(0);
  }, 5000);
}
run().catch(console.error);
