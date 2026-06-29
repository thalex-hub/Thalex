import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, arrayUnion } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const users = await getDocs(collection(db, "users"));
  let targetUser = null;
  users.forEach(u => {
    const data = u.data();
    if (data.email === 'tuyetmai@thalex.vn') {
      targetUser = u;
    }
  });

  if (targetUser) {
    console.log(`Found user: ${targetUser.id}`);
    await updateDoc(doc(db, "users", targetUser.id), {
      permissions: arrayUnion('view_salaries')
    });
    console.log("Updated permissions!");
  } else {
    console.log("User not found!");
  }
  process.exit(0);
}
run().catch(console.error);
