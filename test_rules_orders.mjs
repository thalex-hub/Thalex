import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';

async function run() {
  const testEnv = await initializeTestEnvironment({
    projectId: "gen-lang-client-0900315510",
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  const db = testEnv.authenticatedContext('vnN51rJHpdgaHtEaeCf5gxJrqLu2', { email: 'info.vinasglobal@gmail.com' }).firestore();
  
  try {
      const snap = await db.collection('orders').get();
      console.log('Success!', snap.size);
  } catch (e) {
      console.log('Error:', e.message);
  }
  
  await testEnv.cleanup();
}
run().catch(console.error);
