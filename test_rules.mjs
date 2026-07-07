import { readFileSync, writeFileSync } from 'fs';

let rules = readFileSync('firestore.rules', 'utf8');
rules = rules.replace(
  "    function isOwner(data) { \n       return isSignedIn() && (\n        (data.get('userId', '') == request.auth.uid) || \n        (data.get('createdBy', '') == request.auth.uid) ||\n        (data.get('assignedTo', '') == request.auth.uid) ||\n        (data.get('uid', '') == request.auth.uid) ||\n        (data.get('employeeId', '') == request.auth.uid)\n      );\n    }",
  `    function isOwner(data) { 
       return isSignedIn() && (
        (data.userId == request.auth.uid) || 
        (data.createdBy == request.auth.uid) ||
        (data.assignedTo == request.auth.uid) ||
        (data.uid == request.auth.uid) ||
        (data.employeeId == request.auth.uid)
      );
    }`
);

// We need to also fix followers array-contains
rules = rules.replace(
  /request\.auth\.uid in existing\(\)\.get\('followers', \[\]\)/g,
  "request.auth.uid in resource.data.followers"
);

// We need to fix orders responsibleUserId
rules = rules.replace(
  /existing\(\)\.get\('responsibleUserId', ''\)/g,
  "resource.data.responsibleUserId"
);

writeFileSync('firestore.rules', rules);
