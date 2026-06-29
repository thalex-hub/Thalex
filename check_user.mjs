import admin from "firebase-admin";

async function check() {
  try {
    admin.initializeApp({
      projectId: 'gen-lang-client-0900315510',
      credential: admin.credential.applicationDefault()
    });
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

    console.log("=== LISTING ALL USERS ===");
    const usersSnap = await db.collection("users").get();
    console.log(`Total users in DB: ${usersSnap.size}`);
    usersSnap.forEach(doc => {
      console.log(`ID: ${doc.id}, Email: ${doc.data().email}, Name: ${doc.data().name || doc.data().displayName}, Status: ${doc.data().accountStatus}`);
    });

    console.log("\n=== SPECIFIC CHECK FOR tuyetmai ===");
    const emailToCheck = "tuyetmai@thalex.vn";
    const q = await db.collection("users").where("email", "==", emailToCheck).get();
    if (q.empty) {
      console.log(`No user found with email ${emailToCheck}`);
    } else {
      q.forEach(doc => {
        console.log("Found doc ID:", doc.id, "Data:", doc.data());
      });
    }
  } catch (e) {
    console.error("Error checking user:", e);
  }
}

check();

