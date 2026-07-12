import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('/app/firebase-service-account.json', 'utf8'));

import { google } from 'googleapis';

async function getAccessToken() {
  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/datastore']
  );
  const credentials = await jwtClient.authorize();
  return credentials.access_token;
}

async function run() {
  const token = await getAccessToken();
  const projectId = serviceAccount.project_id;
  
  // Create doc
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/order_proposals`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        name: { stringValue: 'Test from REST' },
        createdBy: { stringValue: 'info.vinasglobal@gmail.com' },
        status: { stringValue: 'pending' },
        followers: { arrayValue: { values: [] } }
      }
    })
  });
  
  const data = await response.json();
  console.log(data);
}

run().catch(console.error);
