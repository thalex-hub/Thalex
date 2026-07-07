import { readFileSync, writeFileSync } from 'fs';

let rules = readFileSync('firestore.rules', 'utf8');
rules = rules.replace(
  /request\.auth\.uid in resource\.data\.followers/g,
  "('followers' in resource.data && request.auth.uid in resource.data.followers)"
);

rules = rules.replace(
  /request\.auth\.token\.email\.lower\(\)\.replace\('\\[\^a-z0-9\\]', '_'\) in resource\.data\.followers/g,
  "('followers' in resource.data && request.auth.token.email.lower().replace('[^a-z0-9]', '_') in resource.data.followers)"
);

rules = rules.replace(
  /resource\.data\.responsibleUserId ==/g,
  "('responsibleUserId' in resource.data && resource.data.responsibleUserId =="
);

// wait, the responsibleUserId replacement might be tricky, let's just do it manually if needed.
writeFileSync('firestore.rules', rules);
