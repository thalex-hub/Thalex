import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, "info.vinasglobal@gmail.com", "vinasglobal@2024");
  const user = auth.currentUser;
  console.log("Logged in as", user.uid);

  const payload = {
    name: "Test Proposal 123",
    createdBy: user.uid,
    createdAt: new Date().toISOString(),
    status: 'pending',
    followers: [user.uid]
  };

  const docRef = await addDoc(collection(db, 'order_proposals'), payload);
  console.log("Created proposal", docRef.id);

  // Monitor it
  const unsub = onSnapshot(collection(db, 'order_proposals'), (snap) => {
    const doc = snap.docs.find(d => d.id === docRef.id);
    if (doc) {
      console.log("Doc exists. Status:", doc.data().status);
    } else {
      console.log("Doc DOES NOT exist!");
    }
  });

  setTimeout(() => {
    unsub();
    console.log("Done.");
    process.exit(0);
  }, 10000);
}
run().catch(console.error);
