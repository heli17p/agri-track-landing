import { Activity, AppSettings, Trip, DEFAULT_SETTINGS } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/* 
  --- AGRICLOUD MASTER KONFIGURATION ---
  Status: ACTIVE
*/

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAyVM8YA2F3XWj0K4grk5pcbB5NMgzzoow",
  authDomain: "agritrack-austria.firebaseapp.com",
  projectId: "agritrack-austria",
  storageBucket: "agritrack-austria.firebasestorage.app",
  messagingSenderId: "384737537234",
  appId: "1:384737537234:web:372b7fb5ed90bc0f7d510b",
  measurementId: "G-YL5BQ30Y4Z"
};

// Initialize Firebase
let db: any = null;
let auth: any = null;

try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("[AgriCloud] Firebase & Auth initialized successfully.");
} catch (e) {
    console.error("[AgriCloud] Initialization failed (check console for details):", e);
}

// Export auth for auth service
export { auth };

// Check ob die Cloud "scharf" geschaltet ist UND wir berechtigt sind
export const isCloudConfigured = () => {
    return !!db && !!auth?.currentUser;
};

// --- SIMULIERTE DATENBANK (LOKAL - FALLBACK & OFFLINE) ---
const STORAGE_KEY_SETTINGS = 'agritrack_settings';
const STORAGE_KEY_ACTIVITIES = 'agritrack_activities';
const STORAGE_KEY_TRIPS = 'agritrack_trips';

export const loadSettings = (): AppSettings => {
  const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      farmName: parsed.farmName || DEFAULT_SETTINGS.farmName
    };
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
};

export const saveData = async (type: 'activity' | 'trip', data: Activity | Trip) => {
  // 1. Save Locally (Offline First) - Immer sofort speichern für schnelle UI
  const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  
  // Update or Add
  const index = existing.findIndex((e: any) => e.id === data.id);
  if (index >= 0) existing[index] = data;
  else existing.unshift(data);
  
  localStorage.setItem(key, JSON.stringify(existing));

  // 2. Sync to Cloud (Only if Logged In)
  if (isCloudConfigured()) {
      try {
          const colName = type === 'activity' ? 'activities' : 'trips';
          // Deep clone to remove potential reactive proxies or undefined values
          const payload = JSON.parse(JSON.stringify(data)); 
          // Add timestamp if missing or update it
          payload.syncedAt = Timestamp.now();
          // Add User ID for security rules (if we had them enabled for owner-only)
          payload.userId = auth.currentUser.uid;
          
          await addDoc(collection(db, colName), payload);
          console.log(`[AgriCloud] Saved ${type} to cloud for user ${auth.currentUser.uid}.`);
      } catch (e) {
          console.error("[AgriCloud] Upload failed (User might be offline or guest):", e);
      }
  }
};

export const loadLocalData = (type: 'activity' | 'trip') => {
    const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
    return JSON.parse(localStorage.getItem(key) || '[]');
}

export const fetchCloudData = async (type: 'activity' | 'trip') => {
    if (!isCloudConfigured()) return [];
    
    try {
        // NOTE: In a real multi-user app, we would query: where("userId", "==", auth.currentUser.uid)
        // For this demo, we assume the collection is shared or rules handle it.
        // We will filter client-side just to be safe if rules aren't set.
        
        const colName = type === 'activity' ? 'activities' : 'trips';
        const q = query(collection(db, colName), orderBy('date', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        // Client-side filter for owned data (simulation of security rules)
        const myData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as any))
            .filter(item => !item.userId || item.userId === auth.currentUser.uid);

        return myData;
    } catch (e) {
        console.error("[AgriCloud] Fetch failed:", e);
        return [];
    }
}
