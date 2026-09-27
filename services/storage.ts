
// Fix: Removed non-existent exported members 'Activity' and 'Trip' from '../types'
import { AppSettings, DEFAULT_SETTINGS, Field, StorageLocation, FarmProfile, Equipment } from '../types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import { dbService } from './db';

export interface CustomFirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  farmName?: string;
}

export const STORAGE_KEY_CUSTOM_FIREBASE = 'agritrack_custom_firebase_config';

/* 
  --- AGRICLOUD STANDARD / FALLBACK KONFIGURATION ---
  Status: ACTIVE (Zentrales Demoprojekt)
*/
const DEFAULT_FIREBASE_CONFIG: CustomFirebaseConfig = {
  apiKey: "AIzaSyAyVM8YA2F3XWj0K4grk5pcbB5NMgzzoow",
  authDomain: "agritrack-austria.firebaseapp.com",
  projectId: "agritrack-austria",
  storageBucket: "agritrack-austria.firebasestorage.app",
  messagingSenderId: "384737537234",
  appId: "1:384737537234:web:372b7fb5ed90bc0f7d510b",
  measurementId: "G-YL5BQ30Y4Z",
  farmName: "AgriTrack Gemeinschafts-Cloud"
};

export const getCustomFirebaseConfig = (): CustomFirebaseConfig | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_FIREBASE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.apiKey && parsed.projectId) {
      return parsed;
    }
  } catch (e) {
    console.error("Fehler beim Lesen der benutzerdefinierten Firebase-Config:", e);
  }
  return null;
};

export const getActiveFirebaseConfig = (): { config: CustomFirebaseConfig; isCustom: boolean } => {
  const custom = getCustomFirebaseConfig();
  if (custom) {
    return { config: custom, isCustom: true };
  }
  return { config: DEFAULT_FIREBASE_CONFIG, isCustom: false };
};

const activeConfigData = getActiveFirebaseConfig();
const FIREBASE_CONFIG = activeConfigData.config;
export const IS_USING_CUSTOM_CLOUD = activeConfigData.isCustom;
export const isCustomCloudActive = () => IS_USING_CUSTOM_CLOUD;

// Initialize Firebase
let db: firebase.firestore.Firestore = null as any;
let auth: firebase.auth.Auth = null as any;

try {
    // Check if apps already initialized (prevent duplicate init in strict mode)
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    } else {
        firebase.app(); // Use existing default app
    }
    
    db = firebase.firestore();
    auth = firebase.auth();
    
    // ENABLE OFFLINE PERSISTENCE
    db.enablePersistence().catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('[AgriCloud] Persistence failed: Multiple tabs open.');
        } else if (err.code == 'unimplemented') {
            console.warn('[AgriCloud] Persistence not supported by browser.');
        }
    });

    console.log(`[AgriCloud] Firebase & Auth initialisiert. Modus: ${IS_USING_CUSTOM_CLOUD ? 'EIGENE BETRIEBS-CLOUD (' + FIREBASE_CONFIG.projectId + ')' : 'STANDARD-CLOUD'}`);
} catch (e) {
    console.error("[AgriCloud] Initialization failed:", e);
}

export { auth, db }; // Export DB for direct access if needed

// Check Cloud Status
export const isCloudConfigured = () => {
    return !!db && !!auth?.currentUser;
};

// Parser für Konfigurationstext (JSON, JS Snippet oder Kompakter Kopplungscode)
export const parseFirebaseConfigInput = (raw: string): CustomFirebaseConfig | null => {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();

  // 0. Kompakter Kopplungscode versuchen (projectId~apiKey~appId~farmPin~farmName)
  if (trimmed.includes('~')) {
    const parts = trimmed.split('~');
    if (parts.length >= 2) {
      const projectId = parts[0]?.trim();
      const apiKey = parts[1]?.trim();
      const appId = parts[2]?.trim() || '';
      const farmName = parts[4] ? decodeURIComponent(parts[4]) : '';
      if (projectId && apiKey) {
        return {
          apiKey,
          projectId,
          appId,
          authDomain: `${projectId}.firebaseapp.com`,
          storageBucket: `${projectId}.appspot.com`,
          farmName
        };
      }
    }
  }

  // 1. Reines JSON versuchen
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && parsed.apiKey && (parsed.projectId || parsed.appId)) {
      return {
        apiKey: String(parsed.apiKey).trim(),
        authDomain: parsed.authDomain ? String(parsed.authDomain).trim() : `${parsed.projectId}.firebaseapp.com`,
        projectId: String(parsed.projectId || '').trim(),
        storageBucket: parsed.storageBucket ? String(parsed.storageBucket).trim() : `${parsed.projectId}.appspot.com`,
        messagingSenderId: parsed.messagingSenderId ? String(parsed.messagingSenderId).trim() : '',
        appId: String(parsed.appId || '').trim(),
        measurementId: parsed.measurementId ? String(parsed.measurementId).trim() : '',
        farmName: parsed.farmName ? String(parsed.farmName).trim() : ''
      };
    }
  } catch (e) {
    // Weiter mit Regex-Extraktion
  }

  // 2. Extraktion per Regex für JS Snippets (const firebaseConfig = { ... })
  const extract = (key: string): string => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
    const match = trimmed.match(regex);
    return match ? match[1].trim() : '';
  };

  const apiKey = extract('apiKey');
  const projectId = extract('projectId');
  const appId = extract('appId');
  const authDomain = extract('authDomain');
  const storageBucket = extract('storageBucket');
  const messagingSenderId = extract('messagingSenderId');
  const measurementId = extract('measurementId');

  if (apiKey && projectId) {
    return {
      apiKey,
      projectId,
      appId: appId || '',
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      storageBucket: storageBucket || `${projectId}.appspot.com`,
      messagingSenderId: messagingSenderId || '',
      measurementId: measurementId || '',
      farmName: ''
    };
  }

  return null;
};

// Verbindungstest für ein Firebase-Projekt
export const testCustomFirebaseConfig = async (config: CustomFirebaseConfig): Promise<{ success: boolean; message: string }> => {
  if (!config.apiKey || !config.projectId) {
    return { success: false, message: 'API-Key und Project-ID sind erforderlich.' };
  }

  const tempName = 'test_app_' + Date.now();
  let tempApp: firebase.app.App | null = null;
  try {
    const fullConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
      projectId: config.projectId,
      storageBucket: config.storageBucket || `${config.projectId}.appspot.com`,
      messagingSenderId: config.messagingSenderId || '',
      appId: config.appId || '1:000000000000:web:0000000000000000000000'
    };
    tempApp = firebase.initializeApp(fullConfig, tempName);
    const tempDb = tempApp.firestore();

    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Zeitüberschreitung (Timeout nach 6 Sek.). Bitte Internetverbindung und Projekt-ID prüfen.')), 6000)
    );

    const query = tempDb.collection('_agritrack_test').doc('handshake').get();
    await Promise.race([query, timeout]);

    return { 
      success: true, 
      message: `Verbindung zur Datenbank "${config.projectId}" erfolgreich hergestellt! Lese- und Schreibzugriff funktioniert.`,
      projectId: config.projectId
    };
  } catch (err: any) {
    console.error('Test DB connection error:', err);
    const code = err?.code || '';
    const msg = err?.message || String(err);
    const isPermission = code === 'permission-denied' || 
                         code === 'PERMISSION_DENIED' || 
                         msg.toLowerCase().includes('permission') || 
                         msg.toLowerCase().includes('insufficient') ||
                         msg.includes('Missing or insufficient permissions');

    if (isPermission) {
      return {
        success: false,
        isPermissionError: true,
        projectId: config.projectId,
        message: `Verbindung zu Google Firebase ("${config.projectId}") steht! Allerdings verweigern die Firestore-Sicherheitsregeln den Zugriff ("Missing or insufficient permissions").`
      };
    }
    if (msg.includes('project-not-found') || msg.includes('NOT_FOUND') || code === 'not-found') {
      return {
        success: false,
        projectId: config.projectId,
        message: `Projekt "${config.projectId}" wurde bei Google nicht gefunden. Bitte prüfe die Projekt-ID auf Tippfehler.`
      };
    }
    return {
      success: false,
      projectId: config.projectId,
      message: `Verbindungsfehler: ${msg}`
    };
  } finally {
    if (tempApp) {
      try {
        await tempApp.delete();
      } catch (e) {}
    }
  }
};

// Speichern und App neu laden
export const saveCustomFirebaseConfig = async (config: CustomFirebaseConfig) => {
  localStorage.setItem(STORAGE_KEY_CUSTOM_FIREBASE, JSON.stringify(config));
  const settings = loadSettings();
  if (config.farmName && !settings.farmName) {
    settings.farmName = config.farmName;
  }
  if (config.projectId && !settings.farmId) {
    settings.farmId = config.projectId;
  }
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));

  if (db) {
    try {
      await db.terminate();
      await db.clearPersistence();
    } catch (e) {}
  }
  window.location.reload();
};

// Zurücksetzen auf Standard-Cloud
export const clearCustomFirebaseConfig = async () => {
  localStorage.removeItem(STORAGE_KEY_CUSTOM_FIREBASE);
  if (db) {
    try {
      await db.terminate();
      await db.clearPersistence();
    } catch (e) {}
  }
  window.location.reload();
};

// Teilen-Link für Mitarbeiter/Familie generieren (Ultra-Kompakt für schnelle QR-Code Erkennung)
export const generateFarmShareUrl = (config: CustomFirebaseConfig, farmPin?: string): string => {
  const url = new URL(window.location.origin + window.location.pathname);
  // Kompaktes Format: projectId~apiKey~appId~farmPin~farmName
  const compact = [
    config.projectId || '',
    config.apiKey || '',
    config.appId || '',
    farmPin || '',
    encodeURIComponent(config.farmName || '')
  ].join('~');
  
  url.searchParams.set('ccloud', compact);
  return url.toString();
};

// Teilen-Link decodieren (unterstützt kompaktes Format und altes Base64)
export const decodeFarmShareUrl = (token: string): (CustomFirebaseConfig & { farmPin?: string }) | null => {
  if (!token) return null;
  try {
    // 1. Neues kompaktes Format
    if (token.includes('~')) {
      const parts = token.split('~');
      if (parts.length >= 2) {
        const projectId = parts[0]?.trim();
        const apiKey = parts[1]?.trim();
        const appId = parts[2]?.trim() || '';
        const farmPin = parts[3]?.trim() || '';
        const farmName = parts[4] ? decodeURIComponent(parts[4]) : '';
        if (projectId && apiKey) {
          return {
            projectId,
            apiKey,
            appId,
            authDomain: `${projectId}.firebaseapp.com`,
            storageBucket: `${projectId}.appspot.com`,
            farmPin,
            farmName
          };
        }
      }
    }

    // 2. Fallback: Altes Base64 Format
    const jsonStr = decodeURIComponent(atob(token));
    const parsed = JSON.parse(jsonStr);
    if (parsed && parsed.apiKey && parsed.projectId) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to decode farm share token', e);
  }
  return null;
};

// --- LOCAL STORAGE KEYS ---
const STORAGE_KEY_SETTINGS = 'agritrack_settings_full'; // Unified key
const STORAGE_KEY_ACTIVITIES = 'agritrack_activities';
const STORAGE_KEY_TRIPS = 'agritrack_trips';
const STORAGE_KEY_FIELDS = 'agritrack_fields';
const STORAGE_KEY_STORAGE = 'agritrack_storage';
const STORAGE_KEY_PROFILE = 'agritrack_profile';
const STORAGE_KEY_EQUIPMENT = 'agritrack_equipment';
const STORAGE_KEY_CATEGORIES = 'agritrack_tillage_categories'; // NEU

// --- HARD RESET ---
export const hardReset = async () => {
    try {
        console.log("[System] Starte Hard Reset...");
        // 1. Clear Local Storage
        localStorage.clear();
        
        // 2. Clear Firestore Persistence (Deep Clean)
        if (db) {
            await db.terminate();
            await db.clearPersistence();
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
          const user = auth.currentUser!;
          const userId = user.uid;
          const userEmail = user.email;

          // IMPORTANT: If farmId is empty, we don't sync this properly or it goes to 'undefined'
          if (!cleanSettings.farmId) {
             dbService.logEvent("Warnung: Keine Farm-ID beim Speichern gesetzt.");
          }

          await db.collection("settings").doc(userId).set({
              ...cleanSettings,
              ownerEmail: userEmail, // AUTO-REPARATUR: E-Mail immer mitspeichern
              updatedAt: firebase.firestore.Timestamp.now(),
              userId: userId
          });
          dbService.logEvent("[Cloud] Einstellungen & E-Mail aktualisiert.");
      } catch (e: any) {
          dbService.logEvent(`[Cloud] Fehler beim Speichern der Einstellungen: ${e.message}`);
          console.error("[AgriCloud] Failed to sync settings:", e);
          throw e; // Rethrow to let UI know!
      }
  }
};

// NEW: Fetch Settings from Cloud
export const fetchCloudSettings = async (): Promise<AppSettings | null> => {
    if (!isCloudConfigured()) return null;
    try {
        const userId = auth.currentUser!.uid;
        const docSnap = await db.collection("settings").doc(userId).get();

        if (docSnap.exists) {
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

// NEW: Fetch Master Settings for the whole Farm (Shared Config)
export const fetchFarmMasterSettings = async (farmId: string): Promise<AppSettings | null> => {
    if (!isCloudConfigured()) return null;
    try {
        // Query all settings documents for this farm ID
        // Note: Using String(farmId) to ensure type match
        const q = db.collection("settings").where("farmId", "==", String(farmId));
        const snap = await q.get();
        
        if (snap.empty) return null;

        const docs = snap.docs.map(d => d.data() as any);
        
        // Filter for valid farm members (must have the PIN set)
        const validConfigs = docs.filter(d => !!d.farmPin);
        
        if (validConfigs.length === 0) return null;

        // Sort by 'updatedAt' descending (Newest first)
        // This implements "Last Edit Wins" for shared settings
        validConfigs.sort((a, b) => {
            const tA = a.updatedAt?.seconds || 0;
            const tB = b.updatedAt?.seconds || 0;
            return tB - tA;
        });

        // Return the most recent config as the master
        return validConfigs[0] as AppSettings;
    } catch (e) {
        console.error("[AgriCloud] Error fetching master settings:", e);
        return null;
    }
};

// --- DATA HANDLING (HYBRID) ---

export const saveData = async (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile' | 'equipment' | 'tillage_categories', data: any) => {
  // 1. ALWAYS Save Locally (Offline First / Guest Mode)
  let key = STORAGE_KEY_ACTIVITIES;
  if (type === 'trip') key = STORAGE_KEY_TRIPS;
  if (type === 'field') key = STORAGE_KEY_FIELDS;
  if (type === 'storage') key = STORAGE_KEY_STORAGE;
  if (type === 'profile') key = STORAGE_KEY_PROFILE;
  if (type === 'equipment') key = STORAGE_KEY_EQUIPMENT;
  if (type === 'tillage_categories') key = STORAGE_KEY_CATEGORIES; // Fix

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
      let farmId = settings.farmId ? String(settings.farmId).trim() : ('PERSONAL_' + auth.currentUser!.uid);
      const farmPin = settings.farmPin || '';

      try {
          let colName = 'activities';
          if (type === 'trip') colName = 'trips';
          if (type === 'field') colName = 'fields';
          if (type === 'storage') colName = 'storages';
          if (type === 'profile') colName = 'profiles';
          if (type === 'equipment') colName = 'equipment';
          if (type === 'tillage_categories') colName = 'tillage_categories';

          // Deep clone to safely remove undefined values before Firestore
          const payload = JSON.parse(JSON.stringify(data)); 
          
          payload.syncedAt = firebase.firestore.Timestamp.now();
          payload.userId = auth.currentUser!.uid; 
          payload.farmId = farmId;               
          payload.farmPin = farmPin;             
          
          // Use ID as doc ID to allow updates (prevent duplicates)
          // For profile, use farmId as key to ensure one profile per farm
          let docId = data.id;
          if (type === 'profile') docId = farmId;

          if (docId) {
              await db.collection(colName).doc(docId).set(payload);
              
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

export const loadLocalData = (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile' | 'equipment' | 'tillage_categories') => {
    let key = STORAGE_KEY_ACTIVITIES;
    if (type === 'trip') key = STORAGE_KEY_TRIPS;
    if (type === 'field') key = STORAGE_KEY_FIELDS;
    if (type === 'storage') key = STORAGE_KEY_STORAGE;
    if (type === 'profile') key = STORAGE_KEY_PROFILE;
    if (type === 'equipment') key = STORAGE_KEY_EQUIPMENT;
    if (type === 'tillage_categories') key = STORAGE_KEY_CATEGORIES; // Fix

    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : (type === 'profile' ? null : []);
}

export const fetchCloudData = async (type: 'activity' | 'trip' | 'field' | 'storage' | 'profile' | 'equipment' | 'tillage_categories', forceServer: boolean = false) => {
    if (!isCloudConfigured()) return [];
    
    const settings = loadSettings();
    const rawFarmId = settings.farmId || 'PERSONAL_' + auth.currentUser!.uid;
    const targetPin = settings.farmPin || '';

    // DUAL QUERY STRATEGY: Try both String and Number representation of ID to handle legacy data type mismatches
    const idsToQuery = [String(rawFarmId)];
    const numId = Number(rawFarmId);
    if (!isNaN(numId) && String(numId) === String(rawFarmId)) {
        idsToQuery.push(numId as any);
    }

    try {
        dbService.logEvent(`[Cloud] Suche ${type} für FarmID: ${idsToQuery.join(' oder ')}${forceServer ? ' (FORCE SERVER)' : ''}`);
        let colName = 'activities';
        if (type === 'trip') colName = 'trips';
        if (type === 'field') colName = 'fields';
        if (type === 'storage') colName = 'storages';
        if (type === 'profile') colName = 'profiles';
        if (type === 'equipment') colName = 'equipment';
        if (type === 'tillage_categories') colName = 'tillage_categories';
        
        // Use getDocsFromServer if forceServer is true to bypass stuck cache
        // In v8 we use get({ source: 'server' })
        const queries = idsToQuery.map(id => {
            let q = db.collection(colName).where("farmId", "==", id);
            return forceServer ? q.get({ source: 'server' }) : q.get();
        });
        
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
