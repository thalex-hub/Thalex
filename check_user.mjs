import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';

const config = {
  projectId: 'gen-lang-client-0900315510',
  apiKey: 'AIzaSyDps7nJUHKERsYDY2g5NjPsbeFPeVf4Als',
  authDomain: 'gen-lang-client-0900315510.firebaseapp.com',
  storageBucket: 'gen-lang-client-0900315510.firebasestorage.app',
};

const app = initializeApp(config);
const db = getFirestore(app, 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7');

async function check() {
  console.log("=== CHECKING FOR info.vinasglobal@gmail.com ===");
  const usersColl = collection(db, 'users');
  
  // Try querying by email
  const qEmail = query(usersColl, where('email', '==', 'info.vinasglobal@gmail.com'));
  const snapEmail = await getDocs(qEmail);
  console.log(`Query by email found ${snapEmail.size} documents:`);
  snapEmail.forEach(d => {
    console.log(`ID: ${d.id} =>`, d.data());
  });

  // Try checking temp doc if any (e.g., info_vinasglobal_gmail_com)
  const tempId = 'info_vinasglobal_gmail_com';
  const tempRef = doc(db, 'users', tempId);
  const tempSnap = await getDoc(tempRef);
  if (tempSnap.exists()) {
    console.log(`Temp doc found at ID "${tempId}" =>`, tempSnap.data());
  } else {
    console.log(`No temp doc found at ID "${tempId}"`);
  }

  // Find all SuperAdmins
  const qSA = query(usersColl, where('roleId', '==', 'SuperAdmin'));
  const snapSA = await getDocs(qSA);
  console.log(`Query for SuperAdmin role found ${snapSA.size} documents:`);
  snapSA.forEach(d => {
    console.log(`ID: ${d.id} =>`, d.data());
  });

  // List all users to see what's there
  console.log("=== LISTING ALL USERS ===");
  const allSnap = await getDocs(usersColl);
  console.log(`Total users in DB: ${allSnap.size}`);
  allSnap.forEach(d => {
    const data = d.data();
    console.log(`ID: ${d.id} | Email: ${data.email} | Role: ${data.roleId} | Status: ${data.accountStatus}`);
  });
}

check().then(() => process.exit(0)).catch(console.error);

