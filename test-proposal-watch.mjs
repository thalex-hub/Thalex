import admin from 'firebase-admin';
import fs from 'fs';

// 1. Admin to generate token
admin.initializeApp();

const db = admin.firestore();

async function run() {
  const payload = {
    name: "Test Proposal Disappear",
    createdBy: "info.vinasglobal@gmail.com",
    createdAt: new Date().toISOString(),
    status: 'pending',
    followers: []
  };

  const docRef = await db.collection('order_proposals').add(payload);
  console.log("Created proposal", docRef.id);

  // monitor
  const unsub = db.collection('order_proposals').doc(docRef.id).onSnapshot(doc => {
    if (doc.exists) {
      console.log("Doc exists. status:", doc.data().status, "updatedAt:", doc.data().updatedAt);
    } else {
      console.log("Doc DOES NOT exist!");
    }
  });

  setTimeout(() => {
    unsub();
    console.log("Done.");
    process.exit(0);
  }, 10000);
}
run().catch(console.error);
