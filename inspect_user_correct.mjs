import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  console.log("Searching user...");
  const users = await getDocs(query(collection(db, "users"), where("email", "==", "vietnhan@thalex.vn")));
  if (users.empty) {
    console.log("No user found with email vietnhan@thalex.vn");
  } else {
    users.forEach(u => {
      console.log(`User Document ID:`, u.id);
      console.log(`User Data:`, JSON.stringify(u.data(), null, 2));
    });
  }
  process.exit(0);
}
run().catch(console.error);
