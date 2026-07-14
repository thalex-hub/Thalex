import admin from 'firebase-admin';

const app = admin.initializeApp({
  projectId: "gen-lang-client-0900315510",
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore(app);
db.settings({ databaseId: "ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7" });

async function run() {
  const proposals = await db.collection("order_proposals").get();
  console.log(`Total proposals in DB: ${proposals.size}`);
  
  // Find vietnhan's uid
  const users = await db.collection("users").where("email", "==", "vietnhan@thalex.vn").get();
  const uid = users.empty ? 'unknown' : users.docs[0].id;
  const legacyId = users.empty ? 'unknown' : users.docs[0].data().legacyId;
  
  let match = 0;
  proposals.forEach(p => {
    const data = p.data();
    if (data.createdBy === uid || data.createdBy === legacyId) {
      match++;
    }
  });
  console.log(`Proposals created by uid or legacyId: ${match}`);
  
  if (match === 0 && proposals.size > 0) {
      // Print the first 3 proposals to see what createdBy looks like
      let i = 0;
      proposals.forEach(p => {
          if (i < 3) {
              console.log(p.id, p.data().createdBy, p.data().name);
              i++;
          }
      })
  }
}
run().catch(console.error);
