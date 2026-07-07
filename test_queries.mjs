import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, limit } from "firebase/firestore";
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
  
  // To avoid unauthenticated access fail on the users collection (which passed here only because we're not using auth rules for users, wait users has 'if isSignedIn()'??)
  // Oh right, this script is NOT signed in, so ALL QUERIES THAT REQUIRE isSignedIn() WILL FAIL!!!
  console.log("WAIT, I am not signed in! I can't test firestore rules without auth!");
  process.exit(0);
}
run().catch(console.error);
