import { readFileSync, writeFileSync } from 'fs';
let rules = readFileSync('firestore.rules', 'utf8');

const oldStr = `          existing().get('assigneeId', '') == request.auth.uid || 
          existing().get('assigneeId', '') == tempId ||
          existing().get('assignerId', '') == request.auth.uid ||
          existing().get('assignerId', '') == tempId ||
          ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.uid ||`;

const newStr = `          ('assigneeId' in resource.data && resource.data.assigneeId == request.auth.uid) || 
          ('assigneeId' in resource.data && resource.data.assigneeId == tempId) ||
          ('assignerId' in resource.data && resource.data.assignerId == request.auth.uid) ||
          ('assignerId' in resource.data && resource.data.assignerId == tempId) ||
          ('responsibleUserId' in resource.data && resource.data.responsibleUserId == request.auth.uid) ||`;

rules = rules.replace(oldStr, newStr);
rules = rules.replace(/tempId in existing\(\)\.get\('followers', \[\]\)/g, "('followers' in resource.data && tempId in resource.data.followers)");

writeFileSync('firestore.rules', rules);
