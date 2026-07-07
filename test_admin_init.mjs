import admin from 'firebase-admin';

async function run() {
  console.log("Initializing admin...");
  admin.initializeApp();
  const db = admin.firestore();
  console.log("Setting database ID...");
  db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });
  
  console.log("Fetching users count...");
  const snap = await db.collection("users").limit(3).get();
  console.log(`Users count: ${snap.size}`);
  snap.forEach(doc => {
    console.log(doc.id, doc.data().email, doc.data().roleId);
  });
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
