import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'gen-lang-client-0900315510',
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();
db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

async function run() {
  const users = await db.collection("users").get();
  let uid = null;
  users.forEach(u => {
    if (u.data().email === "vietnhan@thalex.vn") {
        uid = u.id;
    }
  });
  
  console.log(`User ID: ${uid}`);
  
  const proposals = await db.collection("order_proposals").get();
  console.log(`Total order proposals: ${proposals.size}`);
  
  let found = 0;
  proposals.forEach(p => {
    const data = p.data();
    if (data.createdBy === uid || (data.followers && data.followers.includes(uid))) {
        found++;
        console.log("FOUND PROPOSAL:", p.id, data.name, data.status, data.createdBy);
    }
  });
  console.log(`Found ${found} proposals.`);
}
run().catch(console.error);
