import fs from 'fs';

let content = fs.readFileSync('firestore.rules.bak', 'utf8');

// Normalize line endings to LF (\n)
content = content.replace(/\r\n/g, '\n');

// 1. Let's find the isTaskInvolved function and replace it using a targeted search
const taskInvolvedRegex = /function\s+isTaskInvolved\s*\(\s*\)\s*\{[\s\S]*?return\s+isSignedIn\(\)[\s\S]*?\};\s*\}/;

const cleanIsTaskInvolved = `function isTaskInvolved() {
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

if (taskInvolvedRegex.test(content)) {
  content = content.replace(taskInvolvedRegex, cleanIsTaskInvolved);
  console.log("Replaced isTaskInvolved successfully!");
} else {
  console.error("isTaskInvolved regex did not match!");
}

// 2. Let's find role_permissions lookup and remove it
const targetRolePermissions = `        (exists(/databases/$(database)/documents/role_permissions/$(getUserRole())) &&
         perm in get(/databases/$(database)/documents/role_permissions/$(getUserRole())).data.get('permissions', [])) ||`;

// Normalize whitespaces for comparison
const normalize = (str) => str.replace(/\s+/g, ' ').trim();

const contentLines = content.split('\n');
let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < contentLines.length; i++) {
  if (contentLines[i].includes('role_permissions/$(getUserRole())')) {
    if (startIndex === -1) {
      startIndex = i - 1; // start from (exists...
    }
    endIndex = i + 1; // end at ...get('permissions', [])) ||
  }
}

if (startIndex !== -1 && endIndex !== -1) {
  contentLines.splice(startIndex, endIndex - startIndex + 1);
  content = contentLines.join('\n');
  console.log("Removed role_permissions lookup successfully!");
} else {
  console.error("Could not find role_permissions lookup lines!");
}

// 3. Let's replace task comments update and delete rules
const targetTaskCommentsUpdate = `allow update: if isSignedIn() && existing().userId == request.auth.uid;`;
const targetTaskCommentsDelete = `allow delete: if isDirector() || isHR() || (isSignedIn() && existing().userId == request.auth.uid);`;
const targetTasksDelete = `allow delete: if isTaskLeader() || (isSignedIn() && existing().assignerId == request.auth.uid);`;

content = content.replace(targetTaskCommentsUpdate, `allow update: if isSignedIn() && existing().get('userId', '') == request.auth.uid;`);
content = content.replace(targetTaskCommentsDelete, `allow delete: if isDirector() || isHR() || (isSignedIn() && existing().get('userId', '') == request.auth.uid);`);
content = content.replace(targetTasksDelete, `allow delete: if isTaskLeader() || (isSignedIn() && existing().get('assignerId', '') == request.auth.uid);`);

// 4. Let's replace followers dot notation with get()
// Find any line containing: 'followers' in resource.data && request.auth.uid in resource.data.followers
content = content.replace(/'followers' in resource\.data && request\.auth\.uid in resource\.data\.followers/g, `(request.auth.uid in resource.data.get('followers', []))`);

// 5. Let's replace orders match block rules
const ordersMatchRegex = /match\s+\/orders\/\{id\}\s*\{[\s\S]*?allow\s+update:[\s\S]*?\}\s*\}/;

const cleanOrdersBlock = `match /orders/{id} {
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
                   ));
      allow delete: if isDirector();
      
      match /comments/{commentId} {
        allow read, write: if isSignedIn();
      }
    }`;

if (ordersMatchRegex.test(content)) {
  content = content.replace(ordersMatchRegex, cleanOrdersBlock);
  console.log("Replaced orders block successfully!");
} else {
  // Let's print out some content around orders to see what's going on
  console.error("Orders block regex did not match!");
}

// 6. Fix user activity logs
const targetUserActivityLogs = `allow read: if isDirector() || isHR() || (isSignedIn() && existing().userId == request.auth.uid);`;
content = content.replace(targetUserActivityLogs, `allow read: if isDirector() || isHR() || (isSignedIn() && existing().get('userId', '') == request.auth.uid);`);

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
  console.log("Injected getUserLegacyId helper!");
}

fs.writeFileSync('firestore.rules', content, 'utf8');
console.log("Wrote final firestore.rules!");
