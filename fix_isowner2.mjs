import { readFileSync, writeFileSync } from 'fs';

let rules = readFileSync('firestore.rules', 'utf8');

const oldIsOwner = `    function isOwner(data) { 
      return isSignedIn() && (
        (data.get('userId', '') == request.auth.uid) || 
        (data.get('createdBy', '') == request.auth.uid) ||
        (data.get('assignedTo', '') == request.auth.uid) ||
        (data.get('uid', '') == request.auth.uid) ||
        (request.auth.token.get('email', '').lower() != '' && data.get('email', '').lower() == request.auth.token.get('email', '').lower()) ||
        (request.auth.token.get('email', '').lower() != '' && data.get('userEmail', '').lower() == request.auth.token.get('email', '').lower())
      ); 
    }`;

const newIsOwner = `    function isOwner(data) { 
       return isSignedIn() && (
        ('userId' in data && data.userId == request.auth.uid) || 
        ('createdBy' in data && data.createdBy == request.auth.uid) ||
        ('assignedTo' in data && data.assignedTo == request.auth.uid) ||
        ('uid' in data && data.uid == request.auth.uid) ||
        ('employeeId' in data && data.employeeId == request.auth.uid) ||
        ('email' in data && 'email' in request.auth.token && data.email.lower() == request.auth.token.email.lower()) ||
        ('userEmail' in data && 'email' in request.auth.token && data.userEmail.lower() == request.auth.token.email.lower())
      );
    }`;

rules = rules.replace(/    function isOwner\(data\) \{[\s\S]*?    \}/, newIsOwner);
writeFileSync('firestore.rules', rules);
