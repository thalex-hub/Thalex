import admin from 'firebase-admin';
admin.initializeApp({
  projectId: 'gen-lang-client-0900315510',
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();
db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });
async function run() {
  const users = await db.collection("users").limit(1).get();
  console.log("Users:", users.size);
}
run().catch(console.error);
