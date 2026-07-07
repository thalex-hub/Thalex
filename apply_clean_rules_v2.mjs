import fs from 'fs';

let content = fs.readFileSync('firestore.rules.bak', 'utf8');

// Normalize line endings to LF (\n)
content = content.replace(/\r\n/g, '\n');

// 1. Let's find and replace isTaskInvolved block
// We can locate it by getting lines between function isTaskInvolved() and the matching closing brace.
const lines = content.split('\n');
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function isTaskInvolved()')) {
    startIdx = i;
  }
  if (startIdx !== -1 && lines[i].trim() === '}' && endIdx === -1 && i > startIdx) {
    // Check if the next non-empty line or surrounding structure indicates the end of function
    // Inside the match block, the next lines are match rules
    if (lines[i+1] && (lines[i+1].includes('allow') || lines[i+1].trim() === '')) {
      endIdx = i;
    }
  }
}

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `      function isTaskInvolved() {
        return isSignedIn() && (
          isTaskLeader() || 
          (resource.data.get('assigneeId', '') == request.auth.uid) || 
          (existsUserDoc() && resource.data.get('assigneeId', '') == getUserLegacyId()) ||
          (resource.data.get('assignerId', '') == request.auth.uid) ||
          (existsUserDoc() && resource.data.get('assignerId', '') == getUserLegacyId()) ||
          (resource.data.get('responsibleUserId', '') == request.auth.uid) ||
          (existsUserDoc() && resource.data.get('responsibleUserId', '') == getUserLegacyId()) ||
          (request.auth.uid in resource.data.get('followers', [])) ||
          (existsUserDoc() && getUserLegacyId() in resource.data.get('followers', []))
        );
      }`;
  
  lines.splice(startIdx, endIdx - startIdx + 1, replacement);
  content = lines.join('\n');
  console.log("SUCCESSFULLY replaced isTaskInvolved block!");
} else {
  console.error("Could not locate isTaskInvolved block!");
}

// 2. Remove role_permissions lookup
const targetRolePermissions = `        (exists(/databases/$(database)/documents/role_permissions/$(getUserRole())) &&
         perm in get(/databases/$(database)/documents/role_permissions/$(getUserRole())).data.get('permissions', [])) ||`;

// Splitting and removing
const contentLines = content.split('\n');
let pStart = -1;
let pEnd = -1;
for (let i = 0; i < contentLines.length; i++) {
  if (contentLines[i].includes('role_permissions/$(getUserRole())')) {
    if (pStart === -1) pStart = i - 1;
    pEnd = i + 1;
  }
}
if (pStart !== -1 && pEnd !== -1) {
  contentLines.splice(pStart, pEnd - pStart + 1);
  content = contentLines.join('\n');
  console.log("SUCCESSFULLY removed role_permissions lookup!");
}

// 3. Replace task comments and task delete rules
content = content.replace(`allow update: if isSignedIn() && existing().userId == request.auth.uid;`, `allow update: if isSignedIn() && existing().get('userId', '') == request.auth.uid;`);
content = content.replace(`allow delete: if isDirector() || isHR() || (isSignedIn() && existing().userId == request.auth.uid);`, `allow delete: if isDirector() || isHR() || (isSignedIn() && existing().get('userId', '') == request.auth.uid);`);
content = content.replace(`allow delete: if isTaskLeader() || (isSignedIn() && existing().assignerId == request.auth.uid);`, `allow delete: if isTaskLeader() || (isSignedIn() && existing().get('assignerId', '') == request.auth.uid);`);
console.log("SUCCESSFULLY replaced existing() dot notation rules!");

// 4. Replace followers dot notation with get()
const followersOld = `('followers' in resource.data && request.auth.uid in resource.data.followers)`;
const followersNew = `(request.auth.uid in resource.data.get('followers', []))`;
content = content.split(followersOld).join(followersNew);
console.log("SUCCESSFULLY replaced followers dot notation!");

// 5. Replace orders match block
const ordersLines = content.split('\n');
let oStart = -1;
let oEnd = -1;
for (let i = 0; i < ordersLines.length; i++) {
  if (ordersLines[i].includes('match /orders/{id}')) {
    oStart = i;
  }
  // Find the end of update rule, usually ends before match /comments
  if (oStart !== -1 && ordersLines[i].includes('allow update:') && oEnd === -1) {
    // Keep reading until we close the allow update expression which has );
    for (let j = i; j < ordersLines.length; j++) {
      if (ordersLines[j].includes('));')) {
        oEnd = j;
        break;
      }
    }
  }
}

if (oStart !== -1 && oEnd !== -1) {
  const replacementOrders = `    match /orders/{id} {
      allow read: if isDirector() || isHR() || isFinanceStaff() || 
                   hasPermission('view_orders') || hasPermission('menu_orders_view') || hasPermission('menu_orders') || hasPermission('view_salaries') ||
                   (isSignedIn() && (
                     (resource.data.get('responsibleUserId', '') == request.auth.uid) || 
                     (existsUserDoc() && resource.data.get('responsibleUserId', '') == getUserLegacyId()) ||
                     (request.auth.uid in resource.data.get('followers', [])) ||
                     (existsUserDoc() && getUserLegacyId() in resource.data.get('followers', [])) ||
                     (resource.data.get('customerId', '') == request.auth.uid)
                   ));
      allow create: if isDirector() || isHR() || isFinanceStaff() || hasPermission('create_orders') || hasPermission('menu_orders_edit');
      allow update: if isDirector() || isHR() || isFinanceStaff() || hasPermission('edit_orders') || hasPermission('menu_orders_edit') ||
                    (isSignedIn() && (
                     (resource.data.get('responsibleUserId', '') == request.auth.uid) || 
                     (existsUserDoc() && resource.data.get('responsibleUserId', '') == getUserLegacyId()) ||
                     (request.auth.uid in resource.data.get('followers', [])) ||
                     (existsUserDoc() && getUserLegacyId() in resource.data.get('followers', []))
                    ));`;
  
  ordersLines.splice(oStart, oEnd - oStart + 1, replacementOrders);
  content = ordersLines.join('\n');
  console.log("SUCCESSFULLY replaced orders match block!");
} else {
  console.error("Could not locate orders match block!");
}

// 6. Fix user activity logs
content = content.replace(`allow read: if isDirector() || isHR() || (isSignedIn() && existing().userId == request.auth.uid);`, `allow read: if isDirector() || isHR() || (isSignedIn() && existing().get('userId', '') == request.auth.uid);`);

// 7. Inject getUserLegacyId() helper after getUserRole() helper
if (!content.includes('getUserLegacyId()')) {
  const targetUserRole = `    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('roleId', 'Staff');
    }`;
  
  const replacementUserRole = `    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('roleId', 'Staff');
    }

    function getUserLegacyId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('legacyId', '');
    }`;
  
  content = content.replace(targetUserRole, replacementUserRole);
  console.log("SUCCESSFULLY injected getUserLegacyId helper!");
}

fs.writeFileSync('firestore.rules', content, 'utf8');
console.log("SUCCESSFULLY written final clean firestore.rules!");
