import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let testEnv;

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId: 'ais-test-order-proposals',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  const aliceId = 'alice123';
  const alice = testEnv.authenticatedContext(aliceId, { email: 'alice@example.com' });

  // Add alice's role to users collection
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('users').doc(aliceId).set({ roleId: 'SalesStaff', email: 'alice@example.com' });
  });

  const db = alice.firestore();

  // Test create
  console.log("Testing create...");
  const newDocRef = db.collection('order_proposals').doc('proposal1');
  await assertSucceeds(newDocRef.set({
    name: 'Test',
    createdBy: aliceId,
    followers: []
  }));
  console.log("Create succeeded.");

  // Test read specific
  console.log("Testing read specific...");
  await assertSucceeds(newDocRef.get());
  console.log("Read specific succeeded.");

  // Test query 1
  console.log("Testing query q1...");
  const q1 = db.collection('order_proposals').where('createdBy', '==', aliceId);
  await assertSucceeds(q1.get());
  console.log("Query q1 succeeded.");

  // Test query 2
  console.log("Testing query q2...");
  const q2 = db.collection('order_proposals').where('followers', 'array-contains', aliceId);
  await assertSucceeds(q2.get());
  console.log("Query q2 succeeded.");

  process.exit(0);
}

run().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
