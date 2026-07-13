const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

// Replace (request.auth.uid in resource.data.followers)
rules = rules.replace(/\(request\.auth\.uid in resource\.data\.followers\)/g, "('followers' in resource.data && request.auth.uid in resource.data.followers)");

// Also existing() ones if any
rules = rules.replace(/\(request\.auth\.uid in existing\(\)\.followers\)/g, "('followers' in existing() && request.auth.uid in existing().followers)");

// Also existsUserDoc() && getUserLegacyId() in resource.data.followers
rules = rules.replace(/\(existsUserDoc\(\) && getUserLegacyId\(\) in resource\.data\.followers\)/g, "(existsUserDoc() && 'followers' in resource.data && getUserLegacyId() in resource.data.followers)");

fs.writeFileSync('firestore.rules', rules);
