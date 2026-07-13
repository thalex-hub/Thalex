import admin from 'firebase-admin';

async function run() {
  admin.initializeApp();
  const db = admin.firestore();
  db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });
  
  const users = await db.collection("users").where("email", "==", "vietnhan@thalex.vn").get();
  if (users.empty) {
      console.log("User not found!");
      process.exit(1);
  }
  const uid = users.docs[0].id;
  console.log(`User ID: ${uid}`);
  
  const proposals = await db.collection("order_proposals").get();
  console.log(`Total proposals: ${proposals.size}`);
  
  proposals.forEach(p => {
    if (p.data().createdBy === uid || (p.data().followers && p.data().followers.includes(uid))) {
        console.log("FOUND PROPOSAL FOR USER:", p.id, p.data().name, p.data().status);
    }
  });
  
  process.exit(0);
}
run().catch(console.error);
