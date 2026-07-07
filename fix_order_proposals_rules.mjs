import { readFileSync, writeFileSync } from 'fs';
let rules = readFileSync('firestore.rules', 'utf8');

const oldStr = `(isSignedIn() && request.auth.uid in existing().get('followers', []));`;
const newStr = `(isSignedIn() && ('followers' in resource.data && request.auth.uid in resource.data.followers));`;

rules = rules.replace(oldStr, newStr);

const oldStr2 = `(isSignedIn() && request.auth.uid in existing().get('followers', []));`;
rules = rules.replace(oldStr2, newStr); // in case there are multiple
rules = rules.replace(oldStr2, newStr);
rules = rules.replace(oldStr2, newStr);
rules = rules.replace(oldStr2, newStr);

writeFileSync('firestore.rules', rules);
