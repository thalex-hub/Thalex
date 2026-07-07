import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "info.vinasglobal@gmail.com", "vnt999999");
    console.log("Logged in!");
    
    const users = await getDocs(query(collection(db, "users"), where("email", "==", "vietnhan@thalex.vn")));
    users.forEach(u => {
      console.log(`User:`, u.id, u.data());
    });
    
    const uid = users.docs[0].id;
    const orders = await getDocs(query(collection(db, "orders"), where("responsibleUserId", "==", uid)));
    console.log(`Orders for ${uid}: ${orders.size}`);
    
    const proposals = await getDocs(query(collection(db, "order_proposals"), where("createdBy", "==", uid)));
    console.log(`Proposals created by ${uid}: ${proposals.size}`);

  } catch (e) {
      console.log("Error", e);
  }
  process.exit(0);
}
run();
