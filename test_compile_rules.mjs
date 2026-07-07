import admin from 'firebase-admin';
import fs from 'fs';

async function run() {
  console.log("Initializing admin...");
  admin.initializeApp();
  
  const rulesContent = fs.readFileSync('firestore.rules.bak', 'utf8');
  console.log("Compiling firestore.rules.bak...");
  
  const rulesetObject = {
    source: {
      files: [
        {
          name: 'firestore.rules',
          content: rulesContent
        }
      ]
    }
  };
  
  try {
    const ruleset = await admin.securityRules().createRuleset(rulesetObject);
    console.log("SUCCESS! Original rules compiled perfectly!");
  } catch (error) {
    console.error("Compilation failed!");
    console.error("Error Message:", error.message);
  }
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
