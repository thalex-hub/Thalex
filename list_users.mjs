import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, arrayUnion } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const users = await getDocs(collection(db, "users"));
  users.forEach(u => {
    const data = u.data();
    console.log(data.email);
  });
  process.exit(0);
}
run().catch(console.error);
