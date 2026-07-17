import admin from 'firebase-admin';

async function check() {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: 'gen-lang-client-0900315510',
        credential: admin.credential.applicationDefault()
      });
    }
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

    const emails = ['vietnhan@thalex.com.vn', 'ngocvan@thalex.com.vn', 'tuyetmai@thalex.com.vn'];
    
    for (const email of emails) {
      console.log(`\n=== Checking user: ${email} ===`);
      const snap = await db.collection('users').where('email', '==', email).get();
      if (snap.empty) {
        console.log("NOT FOUND in 'users' collection.");
      } else {
        snap.docs.forEach(doc => {
          console.log(`ID: ${doc.id}`);
          console.log(`Data: ${JSON.stringify(doc.data(), null, 2)}`);
        });
      }
    }

  } catch (e) {
    console.error("Error executing check_users:", e);
  }
}

check();
