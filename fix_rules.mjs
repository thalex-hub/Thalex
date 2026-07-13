import fs from 'fs';

let rules = fs.readFileSync('firestore.rules', 'utf8');

// Replace resource.data.get('fieldName', defaultValue) with resource.data.fieldName
rules = rules.replace(/resource\.data\.get\(\s*'([^']+)'\s*,\s*[^)]+\)/g, 'resource.data.$1');

// Similarly for existing() which is resource.data
rules = rules.replace(/existing\(\)\.get\(\s*'([^']+)'\s*,\s*[^)]+\)/g, 'existing().$1');

// And request.auth.token.get('email', '') to request.auth.token.email
rules = rules.replace(/request\.auth\.token\.get\(\s*'([^']+)'\s*,\s*[^)]+\)/g, 'request.auth.token.$1');

fs.writeFileSync('firestore.rules', rules);
console.log("Rules fixed!");
