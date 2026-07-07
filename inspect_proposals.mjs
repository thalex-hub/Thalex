import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const users = await getDocs(query(collection(db, "users"), where("email", "==", "vietnhan@thalex.vn")));
  if (users.empty) {
      console.log("User not found!");
      process.exit(1);
  }
  const uid = users.docs[0].id;
  console.log(`User ID: ${uid}`);
  
  const proposals = await getDocs(query(collection(db, "order_proposals")));
  console.log(`Total proposals: ${proposals.size}`);
  
  proposals.forEach(p => {
    if (p.data().createdBy === uid || (p.data().followers && p.data().followers.includes(uid))) {
        console.log("FOUND PROPOSAL FOR USER:", p.id, p.data().name, p.data().status);
    }
  });
  
  process.exit(0);
}
run().catch(console.error);
