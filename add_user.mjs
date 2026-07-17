import admin from 'firebase-admin';

async function addUser() {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: 'gen-lang-client-0900315510',
        credential: admin.credential.applicationDefault()
      });
    }
    const db = admin.firestore();
    db.settings({ databaseId: 'ai-studio-6bab7731-3b08-4fdc-8b7d-051f569a2dc7' });

    const email = 'vietnhan@thalex.com.vn';
    const tempId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const userData = {
      fullName: 'Nguyễn Việt Nhân',
      email: email,
      roleId: 'Staff',
      workStatus: 'official',
      accountStatus: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tempPassword: 'Thalex@123',
      needsPasswordChange: true
    };

    console.log(`Adding user ${email} with ID ${tempId}...`);
    await db.collection('users').doc(tempId).set(userData);
    console.log("User added successfully!");

  } catch (e) {
    console.error("Error adding user:", e);
  }
}

addUser();
