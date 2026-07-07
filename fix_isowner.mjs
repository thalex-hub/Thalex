import { readFileSync, writeFileSync } from 'fs';

let rules = readFileSync('firestore.rules', 'utf8');
rules = rules.replace(
  `    function isOwner(data) { 
       return isSignedIn() && (
        (data.userId == request.auth.uid) || 
        (data.createdBy == request.auth.uid) ||
        (data.assignedTo == request.auth.uid) ||
        (data.uid == request.auth.uid) ||
        (data.employeeId == request.auth.uid)
      );
    }`,
  `    function isOwner(data) { 
       return isSignedIn() && (
        ('userId' in data && data.userId == request.auth.uid) || 
        ('createdBy' in data && data.createdBy == request.auth.uid) ||
        ('assignedTo' in data && data.assignedTo == request.auth.uid) ||
        ('uid' in data && data.uid == request.auth.uid) ||
        ('employeeId' in data && data.employeeId == request.auth.uid)
      );
    }`
);
writeFileSync('firestore.rules', rules);
