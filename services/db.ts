import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, DEFAULT_SETTINGS, FeedbackTicket } from '../types';
import { saveData, loadLocalData, saveSettings as saveSettingsToStorage, loadSettings as loadSettingsFromStorage, fetchCloudData, fetchCloudSettings, isCloudConfigured, auth } from './storage';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

// Need direct access to db for advanced features
const getDb = () => {
    try {
        return getFirestore();
    } catch(e) { return null; }
};

type Listener = () => void;
const listeners: { [key: string]: Listener[] } = {
    sync: [],
    change: []
};

const notify = (type: 'sync' | 'change') => {
    listeners[type].forEach(l => l());
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const dbService = {
  // --- BACKUP & RESTORE (Existing code) ---
  createFullBackup: async () => {
      const activities = await dbService.getActivities();
      const fields = await dbService.getFields();
      const storages = await dbService.getStorageLocations();
      const profile = await dbService.getFarmProfile();
      const settings = await dbService.getSettings();

      return {
          meta: { version: '1.0', timestamp: new Date().toISOString() },
          data: { activities, fields, storages, profile, settings }
      };
  },

  restoreFullBackup: async (jsonContent: any) => {
      // ... (Existing implementation) ...
      try {
          if (!jsonContent || !jsonContent.data) throw new Error("Ungültiges Backup");
          const { activities, fields, storages, profile, settings } = jsonContent.data;
          if (activities) localStorage.setItem('agritrack_activities', JSON.stringify(activities));
          if (fields) localStorage.setItem('agritrack_fields', JSON.stringify(fields));
          if (storages) localStorage.setItem('agritrack_storage', JSON.stringify(storages));
          if (profile) localStorage.setItem('agritrack_profile', JSON.stringify(profile));
          if (settings) localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
          notify('change');
          return true;
      } catch (e) { throw e; }
  },
  
  // --- FARM MANAGEMENT (NEW) ---

  // Join a farm (Register user as member)
  joinFarm: async (farmId: string, email: string) => {
      if (!isCloudConfigured() || !farmId) return;
      const db = getDb();
      if (!db || !auth?.currentUser) return;

      try {
          const farmRef = doc(db, 'farms', farmId);
          // Create farm doc if not exists, add user to members
          await setDoc(farmRef, {
              lastActive: Timestamp.now(),
              members: arrayUnion({
                  uid: auth.currentUser.uid,
                  email: email || 'Unbekannt',
                  joinedAt: new Date().toISOString()
              })
          }, { merge: true });
          console.log(`Joined farm ${farmId}`);
      } catch (e) {
          console.error("Join Farm failed:", e);
      }
  },

  getFarmMembers: async (farmId: string) => {
      if (!isCloudConfigured() || !farmId) return [];
      const db = getDb();
      if (!db) return [];

      try {
          const docRef = doc(db, 'farms', farmId);
          // With persistence, this works better offline
          const snap = await getDoc(docRef);
          if (snap.exists()) {
              return snap.data().members || [];
          }
      } catch (e: any) { 
          // Suppress offline errors
          if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
             console.error("Fetch members error:", e); 
          }
      }
      return [];
  },

  getCloudStats: async (farmId: string) => {
      if (!isCloudConfigured() || !farmId) return { activities: 0 };
      const db = getDb();
      if (!db) return { activities: 0 };

      try {
          // Count activities for this farm
          const q = query(collection(db, 'activities'), where("farmId", "==", farmId));
          const snap = await getDocs(q);
          return { activities: snap.size };
      } catch (e: any) { 
          // Return special value to indicate error/offline
          if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
             console.error("Cloud Stats Error:", e);
          }
          return { activities: -1 }; 
      }
  },

  // --- FORCE UPLOAD (IMPROVED) ---
  forceUploadToFarm: async () => {
      if (!isCloudConfigured()) throw new Error("Nicht eingeloggt oder Offline.");
      
      const activities = loadLocalData('activity') as ActivityRecord[];
      console.log(`[Force Upload] Starte Upload von ${activities.length} Aktivitäten...`);
      
      if (activities.length === 0) return; // Nothing to upload

      let count = 0;
      // Process in smaller chunks to avoid timeouts on slow connections
      const chunk = 5; 
      for (let i = 0; i < activities.length; i += chunk) {
          const batch = activities.slice(i, i + chunk);
          // With persistence, 'saveData' resolves quickly (optimistic), so this loop won't hang
          await Promise.all(batch.map(act => saveData('activity', act)));
          count += batch.length;
          console.log(`[Force Upload] ${count}/${activities.length} gesendet...`);
      }
      console.log("[Force Upload] Fertig.");
  },

  // --- MIGRATION (GUEST -> CLOUD) ---
  migrateGuestDataToCloud: async () => {
      if (!isCloudConfigured()) return;
      const localActivities = loadLocalData('activity') as ActivityRecord[];
      for (const act of localActivities) {
          await saveData('activity', act);
      }
      const localSettings = loadSettingsFromStorage();
      await saveSettingsToStorage(localSettings);
  },

  // --- Feedback (Existing) ---
  getFeedback: async (): Promise<FeedbackTicket[]> => {
      const s = localStorage.getItem('agritrack_feedback');
      return s ? JSON.parse(s) : [];
  },
  saveFeedback: async (ticket: FeedbackTicket) => {
      const all = await dbService.getFeedback();
      const index = all.findIndex(t => t.id === ticket.id);
      let newList = index >= 0 ? [...all] : [ticket, ...all];
      if(index >= 0) newList[index] = ticket;
      localStorage.setItem('agritrack_feedback', JSON.stringify(newList));
      notify('change');
  },
  deleteFeedback: async (id: string) => {
      const all = await dbService.getFeedback();
      const filtered = all.filter(t => t.id !== id);
      localStorage.setItem('agritrack_feedback', JSON.stringify(filtered));
      notify('change');
  },

  // --- Activities (Existing) ---
  getActivities: async (): Promise<ActivityRecord[]> => {
    const local = loadLocalData('activity') as ActivityRecord[];
    return local;
  },
  
  syncActivities: async () => {
      if (!isCloudConfigured()) return;
      // ... (Existing sync logic, shortened for brevity as it was correct) ...
      // Sync Settings
      const cloudSettings = await fetchCloudSettings();
      if (cloudSettings) {
          const localSettings = loadSettingsFromStorage();
          const merged = { ...localSettings, ...cloudSettings };
          saveSettingsToStorage(merged);
      }
      // Sync Data
      const cloudData = await fetchCloudData('activity') as ActivityRecord[];
      const localData = loadLocalData('activity') as ActivityRecord[];
      const localIds = new Set(localData.map(a => a.id));
      let newItemsCount = 0;
      cloudData.forEach(cloudItem => {
          if ((cloudItem as any).type === 'TICKET_SYNC') return; 
          if (!localIds.has(cloudItem.id)) {
              localData.push(cloudItem);
              newItemsCount++;
          }
      });
      if (newItemsCount > 0) {
          localStorage.setItem('agritrack_activities', JSON.stringify(localData));
          notify('change');
      }
      notify('sync');
  },
  
  getActivitiesForField: async (fieldId: string): Promise<ActivityRecord[]> => {
    const all = await dbService.getActivities();
    return all.filter(a => a.fieldIds && a.fieldIds.includes(fieldId));
  },
  saveActivity: async (record: ActivityRecord) => {
    if (!record.id) record.id = generateId();
    await saveData('activity', record); 
    notify('change');
  },
  deleteActivity: async (id: string) => {
    const all = await dbService.getActivities();
    const filtered = all.filter(a => a.id !== id);
    localStorage.setItem('agritrack_activities', JSON.stringify(filtered));
    notify('change');
  },

  // --- Fields (Existing) ---
  getFields: async (): Promise<Field[]> => {
    const s = localStorage.getItem('agritrack_fields');
    return s ? JSON.parse(s) : [];
  },
  saveField: async (field: Field) => {
    if (!field.id) field.id = generateId();
    const all = await dbService.getFields();
    const index = all.findIndex(f => f.id === field.id);
    let newList = index >= 0 ? [...all] : [...all, field];
    if (index >= 0) newList[index] = field;
    localStorage.setItem('agritrack_fields', JSON.stringify(newList));
    notify('change');
  },
  deleteField: async (id: string) => {
    const all = await dbService.getFields();
    const filtered = all.filter(f => f.id !== id);
    localStorage.setItem('agritrack_fields', JSON.stringify(filtered));
    notify('change');
  },

  // --- Storage (Existing) ---
  getStorageLocations: async (): Promise<StorageLocation[]> => {
    const s = localStorage.getItem('agritrack_storage');
    if (!s) return [];
    return JSON.parse(s);
  },
  saveStorageLocation: async (storage: StorageLocation) => {
    const all = await dbService.getStorageLocations();
    const index = all.findIndex(s => s.id === storage.id);
    let newList = index >= 0 ? [...all] : [...all, storage];
    if (index >= 0) newList[index] = storage;
    localStorage.setItem('agritrack_storage', JSON.stringify(newList));
    notify('change');
  },
  deleteStorage: async (id: string) => {
    const all = await dbService.getStorageLocations();
    const filtered = all.filter(s => s.id !== id);
    localStorage.setItem('agritrack_storage', JSON.stringify(filtered));
    notify('change');
  },
  processStorageGrowth: async () => {
      const storages = await dbService.getStorageLocations();
      const updated = storages.map(s => {
          return { ...s, currentLevel: Math.min(s.capacity, s.currentLevel + (s.dailyGrowth / 10)) };
      });
      localStorage.setItem('agritrack_storage', JSON.stringify(updated));
      notify('change');
  },

  // --- Profile & Settings (Existing) ---
  getFarmProfile: async (): Promise<FarmProfile[]> => {
    const s = localStorage.getItem('agritrack_profile');
    return s ? [JSON.parse(s)] : [];
  },
  saveFarmProfile: async (profile: FarmProfile) => {
    localStorage.setItem('agritrack_profile', JSON.stringify(profile));
    notify('change');
  },
  getSettings: async (): Promise<AppSettings> => {
    return loadSettingsFromStorage();
  },
  saveSettings: async (settings: AppSettings) => {
    await saveSettingsToStorage(settings);
    // NEW: Register member if farmId is set
    if (settings.farmId && auth?.currentUser?.email) {
        await dbService.joinFarm(settings.farmId, auth.currentUser.email);
    }
    notify('change');
  },

  // --- Events ---
  onSyncComplete: (cb: Listener) => {
    listeners.sync.push(cb);
    return () => { listeners.sync = listeners.sync.filter(l => l !== cb); };
  },
  onDatabaseChange: (cb: Listener) => {
    listeners.change.push(cb);
    return () => { listeners.change = listeners.change.filter(l => l !== cb); };
  }
};
