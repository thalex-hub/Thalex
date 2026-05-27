import { db, auth } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

let cachedIp: string | null = null;

async function fetchIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(id);
    const data = await response.json();
    cachedIp = data.ip;
    return cachedIp;
  } catch (error) {
    console.warn('Could not fetch IP address for logging:', error);
    return null;
  }
}

export async function logActivity(
  action: string, 
  module: string, 
  recordId?: string, 
  details?: any
) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const ipAddress = await fetchIp();
    
    await addDoc(collection(db, 'user_activity_logs'), {
      userId: user.uid,
      userEmail: user.email,
      action,
      module,
      recordId: recordId || null,
      timestamp: new Date().toISOString(),
      ipAddress,
      details: details || null
    });
  } catch (error) {
    console.error('Error logging user activity:', error);
  }
}
