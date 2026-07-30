import admin from 'firebase-admin';

async function checkBonus() {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: 'gen-lang-client-0900315510',
        credential: admin.credential.applicationDefault()
      });
    }
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

    const email = 'vietnhan@thalex.vn';
    console.log(`Checking user ${email}...`);
    const snap = await db.collection('users').where('email', '==', email).get();
    
    if (snap.empty) {
      console.log('No user found with email:', email);
      // Try thalex.com.vn just in case
      const email2 = 'vietnhan@thalex.com.vn';
      console.log(`Checking user ${email2}...`);
      const snap2 = await db.collection('users').where('email', '==', email2).get();
      if (snap2.empty) {
        console.log('No user found with email:', email2);
        return;
      }
      snap2.docs.forEach(d => {
        console.log('ID:', d.id);
        console.log('Data:', JSON.stringify(d.data(), null, 2));
      });
    } else {
      snap.docs.forEach(d => {
        console.log('ID:', d.id);
        console.log('Data:', JSON.stringify(d.data(), null, 2));
      });
    }

  } catch (e) {
    console.error("Error:", e);
  }
}

checkBonus();
