import admin from 'firebase-admin';

async function check() {
  try {
    admin.initializeApp({
      projectId: 'gen-lang-client-0900315510',
      credential: admin.credential.applicationDefault()
    });
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

    console.log("=== PAYMENTS ===");
    const paymentsSnap = await db.collection('payments').get();
    console.log(`Count: ${paymentsSnap.size}`);
    paymentsSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data());
    });

    console.log("=== BUSINESS EXPENSES ===");
    const beSnap = await db.collection('business_expenses').get();
    console.log(`Count: ${beSnap.size}`);
    beSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data());
    });

    console.log("=== PAYMENT REQUESTS ===");
    const prSnap = await db.collection('payment_requests').get();
    console.log(`Count: ${prSnap.size}`);
    prSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data());
    });

    console.log("=== ADVANCE REQUESTS ===");
    const advSnap = await db.collection('advance_requests').get();
    console.log(`Count: ${advSnap.size}`);
    advSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data());
    });

    console.log("=== REIMBURSEMENT REQUESTS ===");
    const reimbSnap = await db.collection('reimbursement_requests').get();
    console.log(`Count: ${reimbSnap.size}`);
    reimbSnap.docs.forEach(doc => {
      console.log(doc.id, doc.data());
    });

  } catch (e) {
    console.error("Error executing inspect:", e);
  }
}

check();
