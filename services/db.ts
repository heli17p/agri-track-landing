import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, DEFAULT_SETTINGS, FeedbackTicket } from '../types';
import { saveData, loadLocalData, saveSettings as saveSettingsToStorage, loadSettings as loadSettingsFromStorage, fetchCloudData, fetchCloudSettings, isCloudConfigured, auth } from './storage';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, arrayUnion, Timestamp, deleteDoc, writeBatch } from 'firebase/firestore';
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
      addLog(`Inspektor: Starte parallele Analyse für FarmID '${farmId}'...`);
      if (!isCloudConfigured()) {
          addLog("Inspektor: Fehler - Nicht verbunden oder Offline.");
          return { error: "Keine Verbindung" };
      }
      const db = getDb();
      if (!db) return { error: "DB Init Fehler" };

      // Dual Query Setup
      const idsToCheck = [String(farmId)];
      const numId = Number(farmId);
      if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

      try {
          // Helper to fetch and merge
          const fetchAll = async (col: string) => {
              const promises = idsToCheck.map(id => getDocs(query(collection(db, col), where("farmId", "==", id))));
              const snaps = await Promise.all(promises);
              const merged = new Map();
              snaps.forEach(s => s.docs.forEach(d => merged.set(d.id, d)));
              return Array.from(merged.values());
          };

          const [settingsDocs, actsDocs, fieldsDocs, storageDocs, profileDocs] = await Promise.all([
              fetchAll('settings'),
              fetchAll('activities'),
              fetchAll('fields'),
              fetchAll('storages'),
              fetchAll('profiles')
          ]);

          const settingsFound = settingsDocs.map(d => ({ id: d.id, ...d.data() }));
          
          const actsFound = actsDocs.map(d => ({ 
              id: d.id, 
              type: d.data().type, 
              date: d.data().date,
              user: d.data().userId ? 'User ID vorhanden' : 'Kein User',
              device: d.data().syncedAt ? 'Via Sync' : 'Manuell',
              farmIdType: typeof d.data().farmId // Debug: Show type
          }));

          const fieldsFound = fieldsDocs.map(d => ({
              id: d.id,
              name: d.data().name,
              area: d.data().areaHa,
              type: d.data().type
          }));

          const storageFound = storageDocs.map(d => ({
              id: d.id,
              name: d.data().name,
              type: d.data().type,
              capacity: d.data().capacity
          }));

          const profileFound = profileDocs.map(d => ({
              id: d.id,
              name: d.data().operatorName,
              address: d.data().address
          }));

          addLog(`Inspektor: Analyse abgeschlossen. ${actsFound.length} Aktivitäten (Dual-Check).`);

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

  // Verify PIN before connecting
  verifyFarmPin: async (farmId: string, pinCandidate: string) => {
      if (!isCloudConfigured() || !farmId) return { valid: false, reason: "Offline" };
      const db = getDb();
      if (!db) return { valid: false, reason: "DB Error" };

      try {
          // Check if ANY settings document exists with this farmId (Dual Check)
          // We check String first as it is the preferred format
          const qStr = query(collection(db, 'settings'), where("farmId", "==", String(farmId)));
          let snapshot = await getDocs(qStr);
          
          if(snapshot.empty) {
              const numId = Number(farmId);
              if(!isNaN(numId)) {
                  const qNum = query(collection(db, 'settings'), where("farmId", "==", numId));
                  const snapNum = await getDocs(qNum);
                  if(!snapNum.empty) snapshot = snapNum;
              }
          }

          if (snapshot.empty) {
              // Farm doesn't exist yet -> PIN is valid (creating new farm)
              return { valid: true, reason: "New Farm" };
          }

          // Farm exists. Check PIN on the first found config (Owner).
          const config = snapshot.docs[0].data();
          const masterPin = config.farmPin;

          if (!masterPin) {
              return { valid: true, reason: "No PIN set" };
          }

          if (masterPin === pinCandidate) {
              return { valid: true, reason: "Match" };
          } else {
              return { valid: false, reason: "Wrong PIN" };
          }

      } catch (e: any) {
          console.error("PIN Check failed:", e);
          return { valid: false, reason: "Check Failed" };
      }
  },

  // Join a farm (Register user as member)
  joinFarm: async (farmId: string, email: string) => {
      if (!isCloudConfigured() || !farmId) return;
      const db = getDb();
      if (!db || !auth?.currentUser) return;

      try {
          // Farm Membership doc ID should use string ID
          const farmRef = doc(db, 'farms', String(farmId));
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
          const docRef = doc(db, 'farms', String(farmId));
          const snap = await getDoc(docRef);
          if (snap.exists()) {
              return snap.data().members || [];
          }
      } catch (e: any) { 
          if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
             console.error("Fetch members error:", e); 
          }
      }
      return [];
  },

  getLocalStats: async () => {
      const activities = loadLocalData('activity') as any[] || [];
      const fields = loadLocalData('field') as any[] || [];
      const storages = loadLocalData('storage') as any[] || [];
      const profiles = await dbService.getFarmProfile() || [];
      
      return { 
          total: activities.length + fields.length + storages.length + profiles.length 
      };
  },

  getCloudStats: async (farmId: string) => {
      if (!isCloudConfigured() || !farmId) return { total: 0, activities: 0, fields: 0, storages: 0, profiles: 0 };
      const db = getDb();
      if (!db) return { total: 0, activities: 0, fields: 0, storages: 0, profiles: 0 };

      try {
          // Setup Dual IDs
          const idsToCheck = [String(farmId)];
          const numId = Number(farmId);
          if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

          addLog(`Prüfe Cloud Status für ID: '${farmId}' (Dual Check)`);
          
          const countCol = async (col: string) => {
              const promises = idsToCheck.map(id => getDocs(query(collection(db, col), where("farmId", "==", id))));
              const snaps = await Promise.all(promises);
              // Sum up UNIQUE docs (in case overlap, though unlikely)
              const ids = new Set();
              snaps.forEach(s => s.docs.forEach(d => ids.add(d.id)));
              return ids.size;
          };

          const [actSize, fieldSize, storeSize, profSize] = await Promise.all([
              countCol('activities'),
              countCol('fields'),
              countCol('storages'),
              countCol('profiles')
          ]);

          return { 
              total: actSize + fieldSize + storeSize + profSize,
              activities: actSize,
              fields: fieldSize,
              storages: storeSize,
              profiles: profSize
          };
      } catch (e: any) { 
          if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
             console.error("Cloud Stats Error:", e);
          }
          return { total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 }; 
      }
  },

  // --- DELETE ENTIRE FARM (OPTIMIZED PARALLEL BATCHING) ---
  deleteEntireFarm: async (farmId: string, pin: string, onProgress?: (msg: string) => void) => {
      if (!isCloudConfigured()) throw new Error("Keine Verbindung");
      const db = getDb();
      if (!db) throw new Error("DB Error");

      const report = (msg: string) => {
          addLog(msg);
          if (onProgress) onProgress(msg);
      };

      report("Verifiziere PIN...");
      const verify = await dbService.verifyFarmPin(farmId, pin);
      if (!verify.valid) throw new Error("Falsche PIN. Löschen verweigert.");

      report("Scanne Cloud-Datenbank (Turbo-Modus)...");

      // Collections to wipe
      const collections = ['activities', 'fields', 'storages', 'profiles'];
      
      // Dual ID check
      const idsToCheck = [String(farmId)];
      const numId = Number(farmId);
      if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

      let allRefs: any[] = [];

      // 1. GATHER ALL REFS IN PARALLEL (Super fast)
      const fetchPromises: Promise<void>[] = [];

      for (const col of collections) {
          for (const idVariant of idsToCheck) {
              fetchPromises.push(
                  getDocs(query(collection(db, col), where("farmId", "==", idVariant)))
                  .then(snap => {
                      snap.docs.forEach(d => allRefs.push(d.ref));
                  })
              );
          }
      }
      
      // Also fetch the 'farms' membership document separately (by Doc ID)
      for (const idVariant of idsToCheck) {
          allRefs.push(doc(db, 'farms', String(idVariant)));
      }

      await Promise.all(fetchPromises);

      // Remove duplicates (if any)
      const uniqueRefs = Array.from(new Set(allRefs.map(r => r.path))).map(path => {
          return allRefs.find(r => r.path === path);
      });

      if (uniqueRefs.length === 0) {
          report("Keine Daten gefunden. Hof ist bereits leer.");
          return 0;
      }

      report(`${uniqueRefs.length} Objekte zum Löschen gefunden.`);

      // 2. BATCH DELETE (Chunking)
      const CHUNK_SIZE = 450; // Safety margin under 500 limit
      const batches = [];
      
      for (let i = 0; i < uniqueRefs.length; i += CHUNK_SIZE) {
          const chunk = uniqueRefs.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(ref => batch.delete(ref));
          batches.push(batch.commit());
      }

      report(`Führe ${batches.length} Batch-Operationen aus...`);
      
      // Execute all batches in parallel
      await Promise.all(batches);

      report(`Erfolg! ${uniqueRefs.length} Objekte wurden unwiderruflich gelöscht.`);
      return uniqueRefs.length;
  },

  // --- FORCE UPLOAD (INTELLIGENT DYNAMIC BATCHING) ---
  forceUploadToFarm: async (onProgress?: (status: string, percent: number) => void) => {
      if (!isCloudConfigured()) throw new Error("Nicht eingeloggt oder Offline.");
      const db = getDb();
      if (!db) throw new Error("DB Error");

      const report = (msg: string, pct: number) => {
          addLog(`[Upload] ${msg}`);
          if (onProgress) onProgress(msg, pct);
      };

      // 1. Connection Check (Write Test)
      report("Prüfe Cloud-Verbindung...", 1);
      try {
          const testRef = doc(db, 'diagnostics', 'ping_' + auth.currentUser?.uid);
          await setDoc(testRef, { lastPing: Timestamp.now() });
      } catch (e: any) {
          throw new Error("Keine Schreibrechte oder Offline. " + e.message);
      }

      // 2. Load data
      report("Analysiere lokale Daten...", 5);
      const queue: { type: string, data: any, sizeKB: number }[] = [];
      
      try {
          const loadAndMeasure = (type: 'activity' | 'field' | 'storage' | 'profile') => {
              let items = loadLocalData(type) as any[];
              if (type === 'profile') {
                  const p = items ? [items] : [];
                  // @ts-ignore
                  items = p.flat();
              }
              if (!items) return;

              items.forEach(item => {
                  const json = JSON.stringify(item);
                  const sizeBytes = new TextEncoder().encode(json).length;
                  queue.push({ 
                      type, 
                      data: item, 
                      sizeKB: Math.round(sizeBytes / 1024 * 10) / 10 
                  });
              });
          };

          loadAndMeasure('profile');
          loadAndMeasure('storage');
          loadAndMeasure('field');
          loadAndMeasure('activity');

          // Ensure Farm ID
          const settings = await loadSettingsFromStorage();
          if (!settings.farmId) throw new Error("Keine Farm-ID in den Einstellungen.");

      } catch (e: any) {
          report("Fehler beim Lesen der Daten: " + e.message, 0);
          throw e;
      }

      if (queue.length === 0) {
          report("Keine lokalen Daten gefunden.", 100);
          return;
      }

      // 3. Process Upload with Dynamic Sizing
      let processed = 0;
      let errors = 0;
      let i = 0;

      while (i < queue.length) {
          const item = queue[i];
          
          // Determine Batch Strategy
          // If item is large (>50KB), send alone. Else, try to batch up to 5 items or 100KB total.
          const currentBatch = [item];
          let currentBatchSize = item.sizeKB;
          
          let j = i + 1;
          if (item.sizeKB < 50) {
              while (j < queue.length && currentBatch.length < 5 && (currentBatchSize + queue[j].sizeKB) < 100) {
                  currentBatch.push(queue[j]);
                  currentBatchSize += queue[j].sizeKB;
                  j++;
              }
          }
          
          // Determine Timeout based on size (Minimum 10s + 1s per 10KB)
          // 500KB -> 10 + 50 = 60s
          const timeoutMs = 15000 + (currentBatchSize * 1000 * 0.5); // very generous
          const timeoutSec = Math.round(timeoutMs / 1000);

          // Report details for large items
          if (currentBatchSize > 50) {
              report(`Sende großes Paket (${currentBatchSize.toFixed(1)} KB, Timeout: ${timeoutSec}s)...`, Math.round((i / queue.length) * 100));
          }

          // Execute Batch
          const promises = currentBatch.map(batchItem => {
              const uploadPromise = saveData(batchItem.type as any, batchItem.data);
              const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Timeout (${timeoutSec}s)`)), timeoutMs)
              );
              return Promise.race([uploadPromise, timeoutPromise]);
          });

          const results = await Promise.allSettled(promises);
          
          results.forEach(res => {
              if (res.status === 'fulfilled') {
                  processed++;
              } else {
                  errors++;
                  addLog(`[Upload] Fehler: ${res.reason}`);
              }
          });

          // Update Progress
          i = j;
          const percent = Math.round((i / queue.length) * 100);
          report(`Upload Fortschritt: ${percent}% (${processed}/${queue.length})`, percent);
          
          // Cool-down for network
          await new Promise(r => setTimeout(r, 200));
      }

      if (errors > 0) {
          report(`Fertig. ${processed} gesendet, ${errors} fehlgeschlagen.`, 100);
          // Don't throw error to allow UI to show partial success
      } else {
          report(`Upload erfolgreich (${processed} Objekte, ${queue.reduce((acc, i) => acc + i.sizeKB, 0).toFixed(1)} KB).`, 100);
      }
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
    return local || [];
  },
  
  syncActivities: async () => {
      if (!isCloudConfigured()) {
          addLog("[Sync] Abbruch: Nicht eingeloggt.");
          return;
      }
      
      addLog("[Sync] Starte Download...");
      
      // 1. Sync Settings
      const cloudSettings = await fetchCloudSettings();
      if (cloudSettings) {
          addLog("[Sync] Cloud-Einstellungen empfangen.");
          const localSettings = loadSettingsFromStorage();
          const merged = { ...localSettings, ...cloudSettings };
          saveSettingsToStorage(merged);
      } else {
          addLog("[Sync] Keine Cloud-Einstellungen gefunden (oder Offline).");
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
          addLog(`[Sync] ${newActs} neue Aktivitäten empfangen.`);
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
          addLog(`[Sync] ${newFields} neue Felder empfangen.`);
      }

      // 4. Sync Storages
      addLog("[Sync] Lade Lagerorte herunter...");
      const cloudStorages = await fetchCloudData('storage') as StorageLocation[];
      const localStorages = loadLocalData('storage') as StorageLocation[];
      // Simple merge: Cloud wins if ID matches, else add
      const localStorageIds = new Set(localStorages.map(s => s.id));
      let newStorages = 0;
      let updatedStorages = 0;
      
      cloudStorages.forEach(cloudItem => {
          if (!localStorageIds.has(cloudItem.id)) {
              localStorages.push(cloudItem);
              newStorages++;
          } else {
              // Update existing? For now, we prefer cloud data if we assume it's master
              const idx = localStorages.findIndex(s => s.id === cloudItem.id);
              if (idx >= 0) {
                  localStorages[idx] = cloudItem;
                  updatedStorages++;
              }
          }
      });
      if (newStorages > 0 || updatedStorages > 0) {
          localStorage.setItem('agritrack_storage', JSON.stringify(localStorages));
          addLog(`[Sync] Lagerorte: ${newStorages} neu, ${updatedStorages} aktualisiert.`);
      }

      // 5. Sync Profile
      addLog("[Sync] Lade Profil...");
      const cloudProfiles = await fetchCloudData('profile') as FarmProfile[];
      if (cloudProfiles.length > 0) {
          localStorage.setItem('agritrack_profile', JSON.stringify(cloudProfiles[0]));
          addLog(`[Sync] Betriebsprofil aktualisiert.`);
      }

      if (newActs > 0 || newFields > 0 || newStorages > 0 || updatedStorages > 0) {
          notify('change');
          addLog("[Sync] Daten erfolgreich aktualisiert.");
      } else {
          addLog("[Sync] Lokale Daten sind bereits aktuell.");
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
