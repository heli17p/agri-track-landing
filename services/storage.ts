import { Activity, AppSettings, Trip, DEFAULT_SETTINGS } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, Timestamp, where } from 'firebase/firestore';
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
  const saved = localStorage.getItem('agritrack_settings_full'); // Use consistent key
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
  localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
};

export const saveData = async (type: 'activity' | 'trip', data: Activity | Trip) => {
  // 1. Save Locally (Offline First)
  const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  
  const index = existing.findIndex((e: any) => e.id === data.id);
  if (index >= 0) existing[index] = data;
  else existing.unshift(data);
  
  localStorage.setItem(key, JSON.stringify(existing));

  // 2. Sync to Cloud (Multi-User Farm Logic)
  if (isCloudConfigured()) {
      const settings = loadSettings();
      
      // Determine target: If Farm ID is set, use it. Otherwise private user bucket.
      // We use the same collection but filter differently.
      const farmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
      const farmPin = settings.farmPin || '';

      try {
          const colName = type === 'activity' ? 'activities' : 'trips';
          const payload = JSON.parse(JSON.stringify(data)); 
          
          payload.syncedAt = Timestamp.now();
          payload.userId = auth.currentUser.uid; // Who created it
          payload.farmId = farmId;               // Which farm it belongs to
          payload.farmPin = farmPin;             // Simple security check
          
          await addDoc(collection(db, colName), payload);
          console.log(`[AgriCloud] Saved ${type} to farm ${farmId}.`);
      } catch (e) {
          console.error("[AgriCloud] Upload failed:", e);
      }
  }
};

export const loadLocalData = (type: 'activity' | 'trip') => {
    const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
    return JSON.parse(localStorage.getItem(key) || '[]');
}

export const fetchCloudData = async (type: 'activity' | 'trip') => {
    if (!isCloudConfigured()) return [];
    
    const settings = loadSettings();
    const targetFarmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
    const targetPin = settings.farmPin || '';

    try {
        console.log(`[Sync] Fetching for Farm: ${targetFarmId}`);
        const colName = type === 'activity' ? 'activities' : 'trips';
        
        // Query by Farm ID
        const q = query(
            collection(db, colName), 
            where("farmId", "==", targetFarmId),
            orderBy('date', 'desc'), 
            limit(100) // Increased limit
        );
        
        const snapshot = await getDocs(q);
        
        // Client-side Security Check:
        // Only return data if PIN matches (if a PIN was set during save)
        const myData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as any))
            .filter(item => {
                // If item has a PIN, it must match our current PIN
                // If item has no PIN (legacy), allow it
                if (item.farmPin && item.farmPin !== targetPin) return false;
                return true;
            });

        return myData;
    } catch (e) {
        console.error("[AgriCloud] Fetch failed:", e);
        // Fallback: If index is missing for orderBy, try simple query
        try {
             const qSimple = query(collection(db, type === 'activity' ? 'activities' : 'trips'), where("farmId", "==", targetFarmId));
             const snapSimple = await getDocs(qSimple);
             return snapSimple.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        } catch(e2) { return []; }
    }
}
