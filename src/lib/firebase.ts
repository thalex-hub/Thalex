import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setLogLevel, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigOriginal from '../../firebase-applet-config.json';

// Sanitize config to avoid trailing whitespace issues
const firebaseConfig = {
  ...firebaseConfigOriginal,
  apiKey: firebaseConfigOriginal.apiKey ? firebaseConfigOriginal.apiKey.trim() : '',
  projectId: firebaseConfigOriginal.projectId ? firebaseConfigOriginal.projectId.trim() : '',
  authDomain: firebaseConfigOriginal.authDomain ? firebaseConfigOriginal.authDomain.trim() : '',
};

const app = initializeApp(firebaseConfig);

// Set log level to 'error' to suppress verbose connection / network stream warning logs
setLogLevel('error');

// Using initializeFirestore with specialized settings for restricted network environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // @ts-ignore - useFetchStreams might not be in all type definitions but is supported by the underlying WebChannel
  useFetchStreams: false,
  ignoreUndefinedProperties: true,
}, firebaseConfigOriginal.firestoreDatabaseId?.trim()); /* CRITICAL: The app will break without this line */

// Enable multi-tab offline persistence
try {
  enableMultiTabIndexedDbPersistence(db)
    .then(() => {
      console.log("Firestore offline persistence successfully enabled.");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn("Firestore offline persistence: multiple tabs open. Enabled in another tab.");
      } else if (err.code === 'unimplemented') {
        // The current browser doesn't support all of the features required to enable persistence
        console.warn("Firestore offline persistence: current browser does not support persistence.");
      } else {
        console.error("Firestore offline persistence failed to enable:", err);
      }
    });
} catch (e) {
  console.error("Error setting up Firestore offline persistence:", e);
}

export const auth = getAuth(app);
export const storage = getStorage(app);

// Test Connection logic
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
    // Note: Permission errors are expected during the heartbeat check before auth is initialized
  }
}

testConnection();
