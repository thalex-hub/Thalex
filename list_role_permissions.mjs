import { db } from './src/lib/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function listRolePermissions() {
  const snap = await getDocs(collection(db, 'role_permissions'));
  
  if (snap.empty) {
    console.log('No role_permissions found.');
  } else {
    console.log('Role Permissions:');
    snap.docs.forEach(doc => {
      console.log(`Role: ${doc.id}`);
      console.log('Permissions:', JSON.stringify(doc.data().permissions || [], null, 2));
    });
  }
}

listRolePermissions();
