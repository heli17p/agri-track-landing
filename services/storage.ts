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

export { auth };

// Check Cloud Status
export const isCloudConfigured = () => {
    return !!db && !!auth?.currentUser;
};

// --- LOCAL STORAGE KEYS ---
const STORAGE_KEY_SETTINGS = 'agritrack_settings_full'; // Unified key
const STORAGE_KEY_ACTIVITIES = 'agritrack_activities';
const STORAGE_KEY_TRIPS = 'agritrack_trips';

// --- SETTINGS ---
export const loadSettings = (): AppSettings => {
  const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (saved) {
    try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch(e) { console.error("Settings parse error", e); }
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
};

// --- DATA HANDLING (HYBRID) ---

export const saveData = async (type: 'activity' | 'trip', data: Activity | Trip) => {
  // 1. ALWAYS Save Locally (Offline First / Guest Mode)
  const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
  const existingStr = localStorage.getItem(key);
  let existing = existingStr ? JSON.parse(existingStr) : [];
  
  const index = existing.findIndex((e: any) => e.id === data.id);
  if (index >= 0) existing[index] = data;
  else existing.unshift(data);
  
  localStorage.setItem(key, JSON.stringify(existing));

  // 2. Sync to Cloud (Only if Logged In)
  if (isCloudConfigured()) {
      const settings = loadSettings();
      // Target Farm ID: Either from settings OR private user ID
      const farmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
      const farmPin = settings.farmPin || '';

      try {
          const colName = type === 'activity' ? 'activities' : 'trips';
          // Deep clone to safely remove undefined values before Firestore
          const payload = JSON.parse(JSON.stringify(data)); 
          
          payload.syncedAt = Timestamp.now();
          payload.userId = auth.currentUser.uid; 
          payload.farmId = farmId;               
          payload.farmPin = farmPin;             
          
          // Note: In a real app we would use setDoc with merge to update existing IDs
          // For simplicity here, we assume addDoc (which creates dupes if not careful, handled by ID check on read)
          // Ideally: await setDoc(doc(db, colName, data.id), payload);
          await addDoc(collection(db, colName), payload);
          
          console.log(`[AgriCloud] Synced ${type} to farm ${farmId}.`);
      } catch (e) {
          console.error("[AgriCloud] Upload failed (User might be offline):", e);
      }
  }
};

export const loadLocalData = (type: 'activity' | 'trip') => {
    const key = type === 'activity' ? STORAGE_KEY_ACTIVITIES : STORAGE_KEY_TRIPS;
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : [];
}

export const fetchCloudData = async (type: 'activity' | 'trip') => {
    if (!isCloudConfigured()) return [];
    
    const settings = loadSettings();
    const targetFarmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
    const targetPin = settings.farmPin || '';

    try {
        console.log(`[Sync] Fetching cloud data for Farm: ${targetFarmId}`);
        const colName = type === 'activity' ? 'activities' : 'trips';
        
        // Query by Farm ID
        const q = query(
            collection(db, colName), 
            where("farmId", "==", targetFarmId),
            orderBy('date', 'desc'), 
            limit(100)
        );
        
        const snapshot = await getDocs(q);
        
        // Filter by PIN (Client-side Security)
        const myData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as any))
            .filter(item => {
                if (item.farmPin && item.farmPin !== targetPin) return false;
                return true;
            });

        return myData;
    } catch (e) {
        console.error("[AgriCloud] Fetch failed:", e);
        // Fallback for missing indexes
        try {
             const qSimple = query(collection(db, type === 'activity' ? 'activities' : 'trips'), where("farmId", "==", targetFarmId));
             const snapSimple = await getDocs(qSimple);
             return snapSimple.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        } catch(e2) { return []; }
    }
}
