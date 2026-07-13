import fs from 'fs';
let rules = fs.readFileSync('firestore.rules', 'utf8');

const fields = ['email', 'assigneeId', 'assignerId', 'responsibleUserId', 'userId', 'advanceOwnerId', 'createdBy', 'customerId', 'type', 'ownerId'];

fields.forEach(field => {
  const regex1 = new RegExp(`resource\\.data\\.${field}`, 'g');
  rules = rules.replace(regex1, `('${field}' in resource.data ? resource.data.${field} : '')`);
  
  const regex2 = new RegExp(`existing\\(\\)\\.${field}`, 'g');
  rules = rules.replace(regex2, `('${field}' in existing() ? existing().${field} : '')`);
});

// For sharedWith array
rules = rules.replace(/\(request\.auth\.uid in resource\.data\.sharedWith\)/g, "('sharedWith' in resource.data && request.auth.uid in resource.data.sharedWith)");
rules = rules.replace(/\('all' in resource\.data\.sharedWith\)/g, "('sharedWith' in resource.data && 'all' in resource.data.sharedWith)");

fs.writeFileSync('firestore.rules', rules);
