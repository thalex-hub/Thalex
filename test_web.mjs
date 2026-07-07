import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const proposals = await getDocs(query(collection(db, "order_proposals")));
  
  console.log("ALL PROPOSALS:");
  proposals.forEach(p => {
    const data = p.data();
    console.log(`ID: ${p.id}, name: ${data.name}, createdBy: ${data.createdBy}, followers: ${data.followers}`);
  });
  process.exit(0);
}
run().catch(console.error);
