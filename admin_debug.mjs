import admin from 'firebase-admin';

// Initialize with default credentials if available
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

async function debug() {
  const emails = ['vietnhan@thalex.com.vn', 'vietnhan@thalex.vn', 'ngocvan@thalex.com.vn'];
  
  console.log('--- Checking Users ---');
  for (const email of emails) {
    const snap = await db.collection('users').where('email', '==', email).get();
    if (snap.empty) {
      console.log(`User ${email}: NOT FOUND`);
    } else {
      snap.docs.forEach(doc => {
        console.log(`User ${email} (ID: ${doc.id}):`);
        console.log(JSON.stringify(doc.data(), null, 2));
      });
    }
  }

  console.log('\n--- Checking Role Permissions ---');
  const rolePermSnap = await db.collection('role_permissions').get();
  if (rolePermSnap.empty) {
    console.log('No role_permissions collection found or it is empty.');
  } else {
    rolePermSnap.docs.forEach(doc => {
      console.log(`Role: ${doc.id}`);
      console.log(`Permissions: ${JSON.stringify(doc.data().permissions || [])}`);
    });
  }
}

debug().catch(console.error);
