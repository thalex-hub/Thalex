import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const uid = 'user123';
  const context = testEnv.authenticatedContext(uid, { email: 'vietnhan@thalex.vn' });
  const db = context.firestore();

  // Test creating a proposal
  const docRef = db.collection('order_proposals').doc('testprop1');
  await assertSucceeds(docRef.set({
    createdBy: uid,
    followers: [uid],
    status: 'pending'
  }));

  // Test reading where createdBy == uid
  const q1 = db.collection('order_proposals').where('createdBy', '==', uid);
  await assertSucceeds(q1.get()).then(() => console.log('q1 succeeded')).catch(e => console.error('q1 failed', e));

  const q2 = db.collection('order_proposals').where('followers', 'array-contains', uid);
  await assertSucceeds(q2.get()).then(() => console.log('q2 succeeded')).catch(e => console.error('q2 failed', e));
  
  await testEnv.cleanup();
}

run().catch(console.error);
