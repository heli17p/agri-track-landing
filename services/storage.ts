import { Activity, AppSettings, Trip, DEFAULT_SETTINGS } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc, Timestamp, enableIndexedDbPersistence } from 'firebase/firestore';
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
    
    // ENABLE OFFLINE PERSISTENCE
    // Critical for unstable connections and "hanging" uploads
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('[AgriCloud] Persistence failed: Multiple tabs open.');
        } else if (err.code == 'unimplemented') {
            console.warn('[AgriCloud] Persistence not supported by browser.');
        }
    });

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

// Modified saveSettings to sync to Cloud
export const saveSettings = async (settings: AppSettings) => {
  // 1. Local Save
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));

  // 2. Cloud Save (if logged in)
  if (isCloudConfigured()) {
      try {
          // Use userId as document ID for settings to avoid duplicates
          const userId = auth.currentUser.uid;
          await setDoc(doc(db, "settings", userId), {
              ...settings,
              updatedAt: Timestamp.now(),
              userId: userId
          });
          console.log("[AgriCloud] Settings synced.");
      } catch (e) {
          console.error("[AgriCloud] Failed to sync settings:", e);
      }
  }
};

// NEW: Fetch Settings from Cloud
export const fetchCloudSettings = async (): Promise<AppSettings | null> => {
    if (!isCloudConfigured()) return null;
    try {
        const userId = auth.currentUser.uid;
        const docRef = doc(db, "settings", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const cloudData = docSnap.data();
            // Merge with defaults to ensure type safety
            const mergedSettings = { ...DEFAULT_SETTINGS, ...cloudData } as AppSettings;
            // Remove meta fields
            delete (mergedSettings as any).updatedAt;
            delete (mergedSettings as any).userId;
            return mergedSettings;
        }
    } catch (e) {
        console.error("[AgriCloud] Failed to fetch settings:", e);
    }
    return null;
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
          
          // Use ID as doc ID to allow updates (prevent duplicates)
          // With persistence enabled, this promise resolves immediately (optimistic write)
          await setDoc(doc(db, colName, data.id), payload);
          
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
    // FALLBACK LOGIC: If no farm ID is set, use personal ID.
    // CRITICAL: Ensure this matches saveData logic exactly!
    const targetFarmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
    const targetPin = settings.farmPin || '';

    try {
        console.log(`[Sync] Fetching cloud data for Farm: ${targetFarmId}`);
        const colName = type === 'activity' ? 'activities' : 'trips';
        
        // FIX: Removed 'orderBy' and 'limit' to avoid needing composite indexes initially.
        // We filter by farmId only, then sort in memory.
        const q = query(
            collection(db, colName), 
            where("farmId", "==", targetFarmId)
        );
        
        // With persistence, this might return cached data if offline
        const snapshot = await getDocs(q);
        
        // Client-side Filter & Sort
        const myData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as any))
            .filter(item => {
                // Security Check: PIN must match if set on item
                if (item.farmPin && item.farmPin !== targetPin) return false;
                return true;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort desc

        console.log(`[Sync] Found ${myData.length} items for this farm.`);
        return myData;
    } catch (e) {
        console.error("[AgriCloud] Fetch failed:", e);
        return [];
    }
}
