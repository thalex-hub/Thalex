import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  console.log("Listing role_permissions...");
  const perms = await getDocs(collection(db, "role_permissions"));
  perms.forEach(doc => {
    console.log(`Role: ${doc.id} | Perms:`, doc.data().permissions?.length || 0);
  });
  process.exit(0);
}
run().catch(console.error);
