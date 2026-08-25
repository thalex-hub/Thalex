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

// Persistence is disabled to avoid assertion errors in iframe/sandboxed environments
// export const db = initializeFirestore...
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // @ts-ignore - useFetchStreams might not be in all type definitions but is supported by the underlying WebChannel
  useFetchStreams: false,
  ignoreUndefinedProperties: true,
}, firebaseConfigOriginal.firestoreDatabaseId?.trim());

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
