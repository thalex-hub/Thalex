import admin from 'firebase-admin';

const app = admin.initializeApp({
  projectId: "gen-lang-client-0900315510",
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore(app);
db.settings({ databaseId: "ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7" });

async function run() {
  const users = await db.collection("users").where("email", "==", "vietnhan@thalex.vn").get();
  users.forEach(u => {
    console.log(`User:`, u.id, u.data());
  });
  
  // also let's look for order proposals created by this user
  if (users.empty) {
      console.log("User not found!");
  } else {
      const uid = users.docs[0].id;
      const proposals = await db.collection("order_proposals").where("createdBy", "==", uid).get();
      console.log(`Proposals created by this user: ${proposals.size}`);
      
      const orders = await db.collection("orders").where("responsibleUserId", "==", uid).get();
      console.log(`Orders with responsibleUserId = this user: ${orders.size}`);
  }
  process.exit(0);
}
run().catch(console.error);
