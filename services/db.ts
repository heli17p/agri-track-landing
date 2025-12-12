import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, DEFAULT_SETTINGS, FeedbackTicket } from '../types';
import { saveData, loadLocalData, saveSettings as saveSettingsToStorage, loadSettings as loadSettingsFromStorage, fetchCloudData, fetchCloudSettings, isCloudConfigured } from './storage';

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
  // --- BACKUP & RESTORE ---
  createFullBackup: async () => {
      const activities = await dbService.getActivities();
      const fields = await dbService.getFields();
      const storages = await dbService.getStorageLocations();
      const profile = await dbService.getFarmProfile();
      const settings = await dbService.getSettings();

      return {
          meta: {
              version: '1.0',
              timestamp: new Date().toISOString(),
              app: 'AgriTrack Austria',
              generator: 'AgriTrack Web App'
          },
          data: {
              activities,
              fields,
              storages,
              profile,
              settings
          }
      };
  },

  restoreFullBackup: async (jsonContent: any) => {
      try {
          if (!jsonContent || !jsonContent.data) {
              throw new Error("Ungültiges Backup-Format");
          }
          
          const { activities, fields, storages, profile, settings } = jsonContent.data;

          // Restore to LocalStorage
          if (activities) localStorage.setItem('agritrack_activities', JSON.stringify(activities));
          if (fields) localStorage.setItem('agritrack_fields', JSON.stringify(fields));
          if (storages) localStorage.setItem('agritrack_storage', JSON.stringify(storages));
          if (profile) localStorage.setItem('agritrack_profile', JSON.stringify(profile));
          if (settings) {
              localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
          }

          notify('change');
          return true;
      } catch (e) {
          console.error("Restore failed", e);
          throw e;
      }
  },

  // --- MIGRATION (GUEST -> CLOUD) ---
  migrateGuestDataToCloud: async () => {
      if (!isCloudConfigured()) return;
      console.log("[Migration] Starte Upload lokaler Daten...");
      const localActivities = loadLocalData('activity') as ActivityRecord[];
      for (const act of localActivities) {
          await saveData('activity', act);
      }
      const localSettings = loadSettingsFromStorage();
      await saveSettingsToStorage(localSettings);
      
      console.log(`[Migration] Abgeschlossen.`);
  },

  // --- Feedback ---
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

  // --- Activities ---
  getActivities: async (): Promise<ActivityRecord[]> => {
    const local = loadLocalData('activity') as ActivityRecord[];
    return local;
  },
  
  syncActivities: async () => {
      if (!isCloudConfigured()) return;
      
      console.log("[Sync] Start...");

      const cloudSettings = await fetchCloudSettings();
      if (cloudSettings) {
          const localSettings = loadSettingsFromStorage();
          const merged = { ...localSettings, ...cloudSettings };
          saveSettingsToStorage(merged);
          console.log("[Sync] Einstellungen aktualisiert.");
      }

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
          console.log(`[Sync] ${newItemsCount} Einträge geladen.`);
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

  // --- Fields ---
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

  // --- Storage ---
  getStorageLocations: async (): Promise<StorageLocation[]> => {
    const s = localStorage.getItem('agritrack_storage');
    if (!s) {
        return [
            { id: 's1', name: 'Güllegrube Hof', type: 'Gülle', capacity: 500, currentLevel: 250, dailyGrowth: 1.5, geo: {lat: 47.5, lng: 14.5} },
            { id: 's2', name: 'Mistplatz', type: 'Mist', capacity: 200, currentLevel: 50, dailyGrowth: 0.2, geo: {lat: 47.501, lng: 14.501} }
        ] as any;
    }
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

  // --- Profile & Settings ---
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
    notify('change');
  },

  onSyncComplete: (cb: Listener) => {
    listeners.sync.push(cb);
    return () => { listeners.sync = listeners.sync.filter(l => l !== cb); };
  },

  onDatabaseChange: (cb: Listener) => {
    listeners.change.push(cb);
    return () => { listeners.change = listeners.change.filter(l => l !== cb); };
  }
};
