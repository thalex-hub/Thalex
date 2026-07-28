import { db } from './src/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function checkUser() {
  const emails = ['ngocvan@thalex.vn', 'ngocvan@thalex.com.vn'];
  for (const email of emails) {
    console.log(`Checking for ${email}...`);
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      console.log(`User ${email} NOT found in Firestore 'users' collection.`);
    } else {
      console.log(`User ${email} found!`);
      snap.docs.forEach(doc => {
        console.log('ID:', doc.id);
        console.log('Data:', JSON.stringify(doc.data(), null, 2));
      });
    }
  }
}

checkUser().catch(console.error);
