import fs from 'fs';
let content = fs.readFileSync('firestore.rules', 'utf8');

const regex = /function hasPermission\(perm\) \{\s*return isSignedIn\(\) && existsUserDoc\(\) && \(\s*\/\/ Fallback for orders/;

const replacement = `function hasPermission(perm) {
      return isSignedIn() && existsUserDoc() && (
        (exists(/databases/$(database)/documents/role_permissions/$(getUserRole())) && 
         perm in get(/databases/$(database)/documents/role_permissions/$(getUserRole())).data.get('permissions', [])) ||
        // Fallback for orders`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('firestore.rules', content, 'utf8');
    console.log("Updated hasPermission in firestore.rules");
} else {
    console.log("Failed to match hasPermission");
}
