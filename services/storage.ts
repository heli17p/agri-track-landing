import { Activity, AppSettings, Trip, DEFAULT_SETTINGS } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';

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

try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    console.log("[AgriCloud] Firebase initialized successfully.");
} catch (e) {
    console.error("[AgriCloud] Initialization failed (check console for details):", e);
}

// Check ob die Cloud "scharf" geschaltet ist
export const isCloudConfigured = () => {
    return !!db;
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

  // 2. Sync to Cloud (Fire & Forget)
  if (isCloudConfigured()) {
      try {
          const colName = type === 'activity' ? 'activities' : 'trips';
          // Deep clone to remove potential reactive proxies or undefined values
          const payload = JSON.parse(JSON.stringify(data)); 
          // Add timestamp if missing or update it
          payload.syncedAt = Timestamp.now();
          
          await addDoc(collection(db, colName), payload);
          console.log(`[AgriCloud] Saved ${type} to cloud.`);
      } catch (e) {
          console.error("[AgriCloud] Upload failed (User might be offline):", e);
          // In einer Vollversion würden wir das in eine "SyncQueue" schreiben
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
        const colName = type === 'activity' ? 'activities' : 'trips';
        const q = query(collection(db, colName), orderBy('date', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("[AgriCloud] Fetch failed:", e);
        return [];
    }
}