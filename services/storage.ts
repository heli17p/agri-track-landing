import { Activity, AppSettings, Trip, DEFAULT_SETTINGS, Field, StorageLocation, FarmProfile } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc, Timestamp, enableIndexedDbPersistence, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { dbService } from './db';

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
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('[AgriCloud] Persistence failed: Multiple tabs open.');
        } else if (err.code == 'unimplemented') {
            console.warn('[AgriCloud] Persistence not supported by browser.');
        }
    });

    console.log("[AgriCloud] Firebase & Auth initialized successfully.");
} catch (e) {
    console.error("[AgriCloud] Initialization failed:", e);
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
const STORAGE_KEY_FIELDS = 'agritrack_fields';
const STORAGE_KEY_STORAGE = 'agritrack_storage';
const STORAGE_KEY_PROFILE = 'agritrack_profile';

// --- HARD RESET ---
export const hardReset = async () => {
    try {
        console.log("[System] Starte Hard Reset...");
        // 1. Clear Local Storage
        localStorage.clear();
        
        // 2. Clear Firestore Persistence (Deep Clean)
        if (db) {
            await terminate(db);
            await clearIndexedDbPersistence(db);
            console.log("[System] Datenbank bereinigt.");
        }
        
        // 3. Reload
        window.location.reload();
    } catch (e) {
        console.error("Reset Error:", e);
        // Fallback reload
        window.location.reload();
    }
};

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
  // Enforce Clean Farm ID (No spaces)
  const cleanSettings = { ...settings };
  if (cleanSettings.farmId) cleanSettings.farmId = String(cleanSettings.farmId).trim();

  // 1. Local Save
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(cleanSettings));

  // 2. Cloud Save (if logged in)
  if (isCloudConfigured()) {
      try {
          const userId = auth.currentUser.uid;
          // IMPORTANT: If farmId is empty, we don't sync this properly or it goes to 'undefined'
          if (!cleanSettings.farmId) {
             dbService.logEvent("Warnung: Keine Farm-ID beim Speichern gesetzt.");
          }

          await setDoc(doc(db, "settings", userId), {
              ...cleanSettings,
              updatedAt: Timestamp.now(),
              userId: userId
          });
          dbService.logEvent("[Cloud] Einstellungen gespeichert.");
      } catch (e: any) {
          dbService.logEvent(`[Cloud] Fehler beim Speichern der Einstellungen: ${e.message}`);
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
    } catch (e: any) {
        dbService.logEvent(`[Cloud] Fehler beim Laden der Einstellungen: ${e.message}`);
        console.error("[AgriCloud] Failed to fetch settings:", e);
    }
    return null;
};

// --- DATA HANDLING (HYBRID) ---

export const saveData = async (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile', data: any) => {
  // 1. ALWAYS Save Locally (Offline First / Guest Mode)
  let key = STORAGE_KEY_ACTIVITIES;
  if (type === 'trip') key = STORAGE_KEY_TRIPS;
  if (type === 'field') key = STORAGE_KEY_FIELDS;
  if (type === 'storage') key = STORAGE_KEY_STORAGE;
  if (type === 'profile') key = STORAGE_KEY_PROFILE;

  // Special handling for Profile (Single Object, not Array)
  if (type === 'profile') {
      localStorage.setItem(key, JSON.stringify(data));
  } else {
      // Array-based types
      const existingStr = localStorage.getItem(key);
      let existing = existingStr ? JSON.parse(existingStr) : [];
      
      const index = existing.findIndex((e: any) => e.id === data.id);
      if (index >= 0) existing[index] = data;
      else existing.unshift(data);
      
      localStorage.setItem(key, JSON.stringify(existing));
  }

  // 2. Sync to Cloud (Only if Logged In)
  if (isCloudConfigured()) {
      const settings = loadSettings();
      // Target Farm ID: Either from settings OR private user ID
      // FORCE STRING to prevent type mismatch issues
      let farmId = settings.farmId ? String(settings.farmId).trim() : ('PERSONAL_' + auth.currentUser.uid);
      const farmPin = settings.farmPin || '';

      try {
          let colName = 'activities';
          if (type === 'trip') colName = 'trips';
          if (type === 'field') colName = 'fields';
          if (type === 'storage') colName = 'storages';
          if (type === 'profile') colName = 'profiles';

          // Deep clone to safely remove undefined values before Firestore
          const payload = JSON.parse(JSON.stringify(data)); 
          
          payload.syncedAt = Timestamp.now();
          payload.userId = auth.currentUser.uid; 
          payload.farmId = farmId;               
          payload.farmPin = farmPin;             
          
          // Use ID as doc ID to allow updates (prevent duplicates)
          // For profile, use farmId as key to ensure one profile per farm
          let docId = data.id;
          if (type === 'profile') docId = farmId;

          if (docId) {
              await setDoc(doc(db, colName, docId), payload);
              
              // Only log sometimes to avoid spam, or log critical ones
              if (Math.random() > 0.8 || type === 'field' || type === 'storage' || type === 'profile') {
                  dbService.logEvent(`[Cloud] ${type} gesendet an Farm ${farmId}`);
              }
              console.log(`[AgriCloud] Synced ${type} to farm ${farmId}.`);
          } else {
              console.error(`[AgriCloud] Missing ID for ${type}, cannot sync.`);
          }
      } catch (e: any) {
          dbService.logEvent(`[Cloud] Upload Fehler: ${e.message}`);
          console.error("[AgriCloud] Upload failed (User might be offline):", e);
      }
  }
};

export const loadLocalData = (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile') => {
    let key = STORAGE_KEY_ACTIVITIES;
    if (type === 'trip') key = STORAGE_KEY_TRIPS;
    if (type === 'field') key = STORAGE_KEY_FIELDS;
    if (type === 'storage') key = STORAGE_KEY_STORAGE;
    if (type === 'profile') key = STORAGE_KEY_PROFILE;

    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : (type === 'profile' ? null : []);
}

export const fetchCloudData = async (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile') => {
    if (!isCloudConfigured()) return [];
    
    const settings = loadSettings();
    const rawFarmId = settings.farmId || 'PERSONAL_' + auth.currentUser.uid;
    const targetPin = settings.farmPin || '';

    // DUAL QUERY STRATEGY: Try both String and Number representation of ID to handle legacy data type mismatches
    const idsToQuery = [String(rawFarmId)];
    const numId = Number(rawFarmId);
    if (!isNaN(numId) && String(numId) === String(rawFarmId)) {
        idsToQuery.push(numId as any);
    }

    try {
        dbService.logEvent(`[Cloud] Suche ${type} für FarmID: ${idsToQuery.join(' oder ')}`);
        let colName = 'activities';
        if (type === 'trip') colName = 'trips';
        if (type === 'field') colName = 'fields';
        if (type === 'storage') colName = 'storages';
        if (type === 'profile') colName = 'profiles';
        
        // We execute multiple queries in parallel for robustness
        const queries = idsToQuery.map(id => 
            getDocs(query(collection(db, colName), where("farmId", "==", id)))
        );
        
        const snapshots = await Promise.all(queries);
        
        // Merge results using Map to avoid duplicates
        const mergedDocs = new Map();
        let totalFound = 0;

        snapshots.forEach(snap => {
            totalFound += snap.size;
            snap.docs.forEach(doc => {
                mergedDocs.set(doc.id, { id: doc.id, ...doc.data() });
            });
        });
        
        dbService.logEvent(`[Cloud] Gefunden: ${mergedDocs.size} ${type} Dokumente (Raw: ${totalFound}).`);

        // Client-side Filter & Sort
        const myData = Array.from(mergedDocs.values())
            .filter((item: any) => {
                // Security Check: PIN must match if set on item
                if (item.farmPin && item.farmPin !== targetPin) return false;
                return true;
            });

        // Sort desc if it has a date
        if (type === 'activity' || type === 'trip') {
             myData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        return myData;
    } catch (e: any) {
        dbService.logEvent(`[Cloud] Download Fehler: ${e.message}`);
        console.error("[AgriCloud] Fetch failed:", e);
        return [];
    }
}
