import fs from 'fs';
let content = fs.readFileSync('firestore.rules', 'utf8');

const regex = /    function isOwner\(data\) \{[\s\S]*?\n    \}/;

const replacement = `    function isOwner(data) {
        return isSignedIn() && (
        ('userId' in data && data.userId == request.auth.uid) || 
        ('createdBy' in data && data.createdBy == request.auth.uid) ||
        ('assignedTo' in data && data.assignedTo == request.auth.uid) ||
        ('assigneeId' in data && (data.assigneeId == request.auth.uid || ('email' in request.auth.token && data.assigneeId == request.auth.token.email) || ('email' in request.auth.token && data.assigneeId == request.auth.token.email.replace('@', '_').replace('.', '_')))) ||
        ('assignerId' in data && data.assignerId == request.auth.uid) ||
        ('responsibleUserId' in data && data.responsibleUserId == request.auth.uid) ||
        ('uid' in data && data.uid == request.auth.uid) ||
        ('employeeId' in data && data.employeeId == request.auth.uid) ||
        ('email' in data && 'email' in request.auth.token && data.email.lower() == request.auth.token.email.lower()) ||
        ('userEmail' in data && 'email' in request.auth.token && data.userEmail.lower() == request.auth.token.email.lower())
      );
    }`;

fs.writeFileSync('firestore.rules', content.replace(regex, replacement), 'utf8');
console.log("Fixed isOwner.");
