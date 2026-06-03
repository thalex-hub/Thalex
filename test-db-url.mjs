import admin from 'firebase-admin';

async function check() {
  try {
    admin.initializeApp({
      projectId: 'gen-lang-client-0900315510',
      credential: admin.credential.applicationDefault()
    });
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });
    const snap = await db.collection('payment_requests').limit(5).get();
    snap.docs.forEach(doc => {
       console.log("ID:", doc.id);
       const attachments = doc.data().attachments || [];
       attachments.forEach(a => {
           console.log("   URL:", a.url);
       });
    });
  } catch (e) {
    console.error(e);
  }
}

check();
