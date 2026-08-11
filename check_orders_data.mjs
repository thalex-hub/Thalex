import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  console.log("Checking orders collection...");
  try {
    const snap = await getDocs(query(collection(db, "orders"), limit(5)));
    console.log(`Found ${snap.size} orders.`);
    snap.forEach(d => {
      console.log(`Order ID: ${d.id}, Name: ${d.data().name}, Code: ${d.data().code}`);
    });
  } catch (err) {
    console.error("Error reading orders:", err);
  }
  process.exit(0);
}
run().catch(console.error);
