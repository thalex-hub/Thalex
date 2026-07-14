import fs from 'fs';
let content = fs.readFileSync('firestore.rules', 'utf8');

const regex = /match\s+\/order_proposals\/\{id\}\s*\{[\s\S]*?allow delete:[\s\S]*?\}\s*\}/;

const cleanOrdersProp = `match /order_proposals/{id} {
      allow read: if isDirector() || isHR() || isFinanceStaff() || isAccountant() || isManager() ||
                    hasPermission('view_orders') || hasPermission('menu_orders_view') ||
                   (isSignedIn() && (
                     (resource.data.get('createdBy', '') == request.auth.uid) || 
                     (existsUserDoc() && resource.data.get('createdBy', '') == getUserLegacyId()) ||
                     (request.auth.uid in resource.data.get('followers', [])) ||
                     (existsUserDoc() && getUserLegacyId() in resource.data.get('followers', []))
                   ));
      allow create: if isSignedIn();
      allow update: if isDirector() || isHR() || isFinanceStaff() || isAccountant() || isManager() ||
                    hasPermission('approve_orders') || hasPermission('menu_orders_edit') ||
                   (isSignedIn() && (
                     (resource.data.get('createdBy', '') == request.auth.uid) || 
                     (existsUserDoc() && resource.data.get('createdBy', '') == getUserLegacyId()) ||
                     (request.auth.uid in resource.data.get('followers', [])) ||
                     (existsUserDoc() && getUserLegacyId() in resource.data.get('followers', []))
                   ));
      allow delete: if isDirector() || isHR() || isFinanceStaff();
    }`;

if (regex.test(content)) {
    content = content.replace(regex, cleanOrdersProp);
    fs.writeFileSync('firestore.rules', content, 'utf8');
    console.log("Updated!");
} else {
    console.log("Did not match!");
}
