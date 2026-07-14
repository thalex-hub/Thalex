import fs from 'fs';
let content = fs.readFileSync('firestore.rules', 'utf8');

const regex = /function isDirector\(\) \{[\s\S]*?existsUserDoc\(\) && isDirectorRole\(getUserRole\(\)\)\)\s*\);\s*\}/;

const newIsDirector = `function isDirector() { 
      return isSignedIn() && (
        request.auth.uid == 'vnN51rJHpdgaHtEaeCf5gxJrqLu2' ||
        ('email' in request.auth.token && request.auth.token.email.lower() == 'thangcd11@gmail.com'.lower()) || 
        ('email' in request.auth.token && request.auth.token.email.lower() == 'info.vinasglobal@gmail.com'.lower()) || 
        exists(/databases/$(database)/documents/admins/$(request.auth.uid)) ||
        (existsUserDoc() && isDirectorRole(getUserRole()))
      );
    }`;

if (regex.test(content)) {
    content = content.replace(regex, newIsDirector);
    fs.writeFileSync('firestore.rules', content, 'utf8');
    console.log("Updated isDirector in firestore.rules");
} else {
    console.log("Failed to match isDirector regex");
}
