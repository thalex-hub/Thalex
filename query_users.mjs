import admin from 'firebase-admin';

async function run() {
  console.log("Initializing admin...");
  admin.initializeApp({
    projectId: 'gen-lang-client-0900315510'
  });
  const db = admin.firestore();
  db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });
  
  console.log("Querying users...");
  const snap = await db.collection("users").get();
  console.log(`Found ${snap.size} users:`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Email: ${data.email}`);
    console.log(`  FullName: ${data.fullName}`);
    console.log(`  RoleId: ${data.roleId}`);
    console.log(`  LegacyId: ${data.legacyId}`);
    console.log(`  Fields:`, Object.keys(data));
  });
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
