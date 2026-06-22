import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function check() {
  const q = await db.collection("users").where("email", "==", "ngocvan@thalex.vn").get();
  if (q.empty) {
    console.log("No user found with email ngocvan@thalex.vn");
  } else {
    q.forEach(doc => {
      console.log("Found doc ID:", doc.id, "Data:", doc.data());
    });
  }
}

check().catch(console.error);
