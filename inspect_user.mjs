import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const users = await getDocs(query(collection(db, "users"), where("email", "==", "vietnhan@thalex.vn")));
  users.forEach(u => {
    console.log(`User:`, u.id, u.data());
  });
  process.exit(0);
}
run().catch(console.error);
