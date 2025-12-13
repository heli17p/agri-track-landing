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

// --- LOGGING SYSTEM ---
const _logs: string[] = [];
const MAX_LOGS = 100;

const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    _logs.unshift(entry); // Newest first
    if (_logs.length > MAX_LOGS) _logs.pop();
    console.log(entry); // Also log to console
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const dbService = {
  // Expose Logger
  logEvent: (msg: string) => addLog(msg),
  getLogs: () => [..._logs],

  // --- DEBUG / INSPECTOR ---
  inspectCloudData: async (farmId: string) => {
      addLog(`Inspektor: Starte Analyse für FarmID '${farmId}'...`);
      if (!isCloudConfigured()) {
          addLog("Inspektor: Fehler - Nicht verbunden oder Offline.");
          return { error: "Keine Verbindung" };
      }
      const db = getDb();
      if (!db) return { error: "DB Init Fehler" };

      try {
          // 1. Check Settings
          const settingsRef = collection(db, 'settings');
          const qSettings = query(settingsRef, where("farmId", "==", farmId));
          const settingsSnap = await getDocs(qSettings);
          const settingsFound = settingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          addLog(`Inspektor: ${settingsFound.length} Einstellungs-Dokumente gefunden.`);

          // 2. Check Activities
          const actsRef = collection(db, 'activities');
          const qActs = query(actsRef, where("farmId", "==", farmId));
          const actsSnap = await getDocs(qActs);
          const actsFound = actsSnap.docs.map(d => ({ 
              id: d.id, 
              type: d.data().type, 
              date: d.data().date,
              user: d.data().userId ? 'User ID vorhanden' : 'Kein User',
              device: d.data().syncedAt ? 'Via Sync' : 'Manuell'
          }));
          addLog(`Inspektor: ${actsFound.length} Aktivitäten gefunden.`);

          // 3. Check Fields
          const fieldsRef = collection(db, 'fields');
          const qFields = query(fieldsRef, where("farmId", "==", farmId));
          const fieldsSnap = await getDocs(qFields);
          const fieldsFound = fieldsSnap.docs.map(d => ({
              id: d.id,
              name: d.data().name,
              area: d.data().areaHa,
              type: d.data().type
          }));
          addLog(`Inspektor: ${fieldsFound.length} Felder gefunden.`);

          // 4. Check Storages
          const storageRef = collection(db, 'storages');
          const qStorage = query(storageRef, where("farmId", "==", farmId));
          const storageSnap = await getDocs(qStorage);
          const storageFound = storageSnap.docs.map(d => ({
              id: d.id,
              name: d.data().name,
              type: d.data().type,
              capacity: d.data().capacity
          }));
          addLog(`Inspektor: ${storageFound.length} Lager gefunden.`);

          // 5. Check Profiles
          const profileRef = collection(db, 'profiles');
          const qProfile = query(profileRef, where("farmId", "==", farmId));
          const profileSnap = await getDocs(qProfile);
          const profileFound = profileSnap.docs.map(d => ({
              id: d.id,
              name: d.data().operatorName,
              address: d.data().address
          }));
          addLog(`Inspektor: ${profileFound.length} Profile gefunden.`);

          return {
              settings: settingsFound,
              activities: actsFound,
              fields: fieldsFound,
              storages: storageFound,
              profiles: profileFound,
              meta: {
                  checkedFarmId: farmId,
                  timestamp: new Date().toISOString()
              }
          };

      } catch (e: any) {
          addLog(`Inspektor Fehler: ${e.message}`);
          return { error: e.message };
      }
  },

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
          addLog(`Cloud: Farm '${farmId}' beigetreten.`);
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
          // Count activities
          const qAct = query(collection(db, 'activities'), where("farmId", "==", farmId));
          const snapAct = await getDocs(qAct);
          
          // Count fields
          const qField = query(collection(db, 'fields'), where("farmId", "==", farmId));
          const snapField = await getDocs(qField);

          return { activities: snapAct.size + snapField.size };
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
      
      const chunk = 5; 

      // 1. Upload Activities
      const activities = loadLocalData('activity') as ActivityRecord[];
      addLog(`[Upload] Starte Upload von ${activities.length} lokalen Aktivitäten...`);
      let count = 0;
      for (let i = 0; i < activities.length; i += chunk) {
          const batch = activities.slice(i, i + chunk);
          await Promise.all(batch.map(act => saveData('activity', act)));
          count += batch.length;
          addLog(`[Upload] Aktivitäten ${count}/${activities.length}...`);
      }

      // 2. Upload Fields
      const fields = loadLocalData('field') as Field[];
      addLog(`[Upload] Starte Upload von ${fields.length} lokalen Feldern...`);
      count = 0;
      for (let i = 0; i < fields.length; i += chunk) {
          const batch = fields.slice(i, i + chunk);
          await Promise.all(batch.map(f => saveData('field', f)));
          count += batch.length;
          addLog(`[Upload] Felder ${count}/${fields.length}...`);
      }

      // 3. Upload Storages
      const storages = loadLocalData('storage') as StorageLocation[];
      addLog(`[Upload] Starte Upload von ${storages.length} Lagern...`);
      for (const s of storages) {
          await saveData('storage', s);
      }

      // 4. Upload Profile
      const profiles = await dbService.getFarmProfile(); // Helper that returns array
      if (profiles.length > 0) {
          addLog(`[Upload] Sende Betriebsprofil...`);
          await saveData('profile', profiles[0]);
      }

      addLog("[Upload] Vollständiger Upload beendet.");
  },

  // --- MIGRATION (GUEST -> CLOUD) ---
  migrateGuestDataToCloud: async () => {
      if (!isCloudConfigured()) return;
      addLog("[Migration] Prüfe lokale Gast-Daten für Upload...");
      
      const localActivities = loadLocalData('activity') as ActivityRecord[];
      for (const act of localActivities) {
          await saveData('activity', act);
      }

      const localFields = loadLocalData('field') as Field[];
      for (const f of localFields) {
          await saveData('field', f);
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
      if (!isCloudConfigured()) {
          addLog("[Sync] Abbruch: Nicht eingeloggt.");
          return;
      }
      
      addLog("[Sync] Starte Synchronisation...");
      
      // 1. Sync Settings
      const cloudSettings = await fetchCloudSettings();
      if (cloudSettings) {
          addLog("[Sync] Cloud-Einstellungen empfangen.");
          const localSettings = loadSettingsFromStorage();
          const merged = { ...localSettings, ...cloudSettings };
          saveSettingsToStorage(merged);
      } else {
          addLog("[Sync] Keine Cloud-Einstellungen gefunden.");
      }

      // 2. Sync Activities
      addLog("[Sync] Lade Aktivitäten herunter...");
      const cloudData = await fetchCloudData('activity') as ActivityRecord[];
      const localData = loadLocalData('activity') as ActivityRecord[];
      const localIds = new Set(localData.map(a => a.id));
      let newActs = 0;
      
      cloudData.forEach(cloudItem => {
          if ((cloudItem as any).type === 'TICKET_SYNC') return; 
          if (!localIds.has(cloudItem.id)) {
              localData.push(cloudItem);
              newActs++;
          }
      });
      if (newActs > 0) {
          localStorage.setItem('agritrack_activities', JSON.stringify(localData));
          addLog(`[Sync] ${newActs} neue Aktivitäten gespeichert.`);
      }

      // 3. Sync Fields
      addLog("[Sync] Lade Felder herunter...");
      const cloudFields = await fetchCloudData('field') as Field[];
      const localFields = loadLocalData('field') as Field[];
      const localFieldIds = new Set(localFields.map(f => f.id));
      let newFields = 0;

      cloudFields.forEach(cloudItem => {
          if (!localFieldIds.has(cloudItem.id)) {
              localFields.push(cloudItem);
              newFields++;
          }
      });
      if (newFields > 0) {
          localStorage.setItem('agritrack_fields', JSON.stringify(localFields));
          addLog(`[Sync] ${newFields} neue Felder gespeichert.`);
      }

      // 4. Sync Storages
      addLog("[Sync] Lade Lagerorte herunter...");
      const cloudStorages = await fetchCloudData('storage') as StorageLocation[];
      const localStorages = loadLocalData('storage') as StorageLocation[];
      // Simple merge: Cloud wins if ID matches, else add
      const localStorageIds = new Set(localStorages.map(s => s.id));
      let newStorages = 0;
      
      cloudStorages.forEach(cloudItem => {
          if (!localStorageIds.has(cloudItem.id)) {
              localStorages.push(cloudItem);
              newStorages++;
          } else {
              // Update existing? For now, we prefer cloud data if we assume it's master
              const idx = localStorages.findIndex(s => s.id === cloudItem.id);
              if (idx >= 0) localStorages[idx] = cloudItem;
          }
      });
      if (newStorages > 0 || cloudStorages.length > 0) {
          localStorage.setItem('agritrack_storage', JSON.stringify(localStorages));
          addLog(`[Sync] Lagerorte aktualisiert.`);
      }

      // 5. Sync Profile
      addLog("[Sync] Lade Profil...");
      const cloudProfiles = await fetchCloudData('profile') as FarmProfile[];
      if (cloudProfiles.length > 0) {
          localStorage.setItem('agritrack_profile', JSON.stringify(cloudProfiles[0]));
          addLog(`[Sync] Betriebsprofil aktualisiert.`);
      }

      if (newActs > 0 || newFields > 0 || newStorages > 0) {
          notify('change');
      } else {
          addLog("[Sync] Lokale Daten sind aktuell.");
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
    await saveData('field', field); 
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
    // 1. Save Local (Via saveData helper which does local+cloud)
    if (!storage.id) storage.id = generateId();
    await saveData('storage', storage);
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
      // Bulk update locally
      localStorage.setItem('agritrack_storage', JSON.stringify(updated));
      // Cloud update? This runs often (tracking loop). 
      // Maybe only sync at end of session? For now, we keep it local until a manual save or sync happens.
      notify('change');
  },

  // --- Profile & Settings (Existing) ---
  getFarmProfile: async (): Promise<FarmProfile[]> => {
    const s = localStorage.getItem('agritrack_profile');
    return s ? [JSON.parse(s)] : [];
  },
  saveFarmProfile: async (profile: FarmProfile) => {
    await saveData('profile', profile);
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
