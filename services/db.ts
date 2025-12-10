import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, DEFAULT_SETTINGS, FeedbackTicket } from '../types';
import { saveData, loadLocalData, saveSettings as saveSettingsToStorage, loadSettings as loadSettingsFromStorage, fetchCloudData, isCloudConfigured } from './storage';

/*
  DB SERVICE ADAPTER
  ==================
  Dieser Service verbindet die lokale 'localStorage' Datenbank mit der neuen 'AgriCloud'.
*/

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
  // --- MIGRATION (GUEST -> CLOUD) ---
  migrateGuestDataToCloud: async () => {
      if (!isCloudConfigured()) return; // Nur wenn User eingeloggt ist
      
      console.log("[Migration] Prüfe lokale Daten für Cloud-Upload...");
      
      // 1. Aktivitäten
      const localActivities = loadLocalData('activity') as ActivityRecord[];
      // Wir prüfen nicht ob sie schon da sind (da wir keine Cloud-Liste haben), 
      // wir senden einfach alles. Firebase IDs verhindern Duplikate normalerweise, 
      // aber hier senden wir einfach "Blind".
      // Besser: Wir markieren lokal, was schon gesynced ist.
      // Für diesen einfachen Fall: Wir senden einfach alle lokalen Daten.
      
      let count = 0;
      for (const act of localActivities) {
          // Prüfen ob schon Zeitstempel für Sync da ist, um unnötigen Traffic zu vermeiden?
          // Wir senden einfach alles, was lokal ist.
          await saveData('activity', act);
          count++;
      }
      
      console.log(`[Migration] ${count} Aktivitäten in die Cloud kopiert.`);
  },

  // --- Feedback / Tickets ---
  getFeedback: async (): Promise<FeedbackTicket[]> => {
      const s = localStorage.getItem('agritrack_feedback');
      return s ? JSON.parse(s) : [
          { id: '1', title: 'Mineraldünger Erfassung', description: 'Ich brauche eine Auswahl für NPK Dünger bei den Tätigkeiten.', votes: 3, status: 'OPEN', date: new Date().toISOString(), author: 'Betrieb Mayer', comments: [] }
      ];
  },

  saveFeedback: async (ticket: FeedbackTicket) => {
      const all = await dbService.getFeedback();
      const index = all.findIndex(t => t.id === ticket.id);
      let newList;
      if (index >= 0) {
          newList = [...all];
          newList[index] = ticket;
      } else {
          newList = [ticket, ...all];
      }
      localStorage.setItem('agritrack_feedback', JSON.stringify(newList));
      notify('change');
      
      // Sync Ticket to Cloud (Activity Stream hack for now)
      if (isCloudConfigured()) {
          saveData('activity', { ...ticket, type: 'TICKET_SYNC' } as any); 
      }
  },

  deleteFeedback: async (id: string) => {
      const all = await dbService.getFeedback();
      const filtered = all.filter(t => t.id !== id);
      localStorage.setItem('agritrack_feedback', JSON.stringify(filtered));
      notify('change');
  },

  // --- Activities ---
  getActivities: async (): Promise<ActivityRecord[]> => {
    // Priority: Local Cache for speed
    const local = loadLocalData('activity') as ActivityRecord[];
    return local;
  },
  
  // Explicit Cloud Sync Trigger
  syncActivities: async () => {
      if (!isCloudConfigured()) return;
      
      const cloudData = await fetchCloudData('activity') as ActivityRecord[];
      const localData = loadLocalData('activity') as ActivityRecord[];
      
      // Simple Merge: Add missing cloud items to local
      // (In a real app, we would handle conflicts and updates more carefully)
      const localIds = new Set(localData.map(a => a.id));
      let newItemsCount = 0;
      
      cloudData.forEach(cloudItem => {
          // Ignore ticket syncs
          if ((cloudItem as any).type === 'TICKET_SYNC') return;
          
          if (!localIds.has(cloudItem.id)) {
              localData.push(cloudItem);
              newItemsCount++;
          }
      });
      
      if (newItemsCount > 0) {
          localStorage.setItem('agritrack_activities', JSON.stringify(localData));
          notify('change');
          console.log(`[Sync] ${newItemsCount} neue Einträge aus der Cloud geladen.`);
      }
  },
  
  getActivitiesForField: async (fieldId: string): Promise<ActivityRecord[]> => {
    const all = await dbService.getActivities();
    return all.filter(a => a.fieldIds && a.fieldIds.includes(fieldId));
  },

  saveActivity: async (record: ActivityRecord) => {
    if (!record.id) record.id = generateId();
    
    // 1. Update Local
    const all = await dbService.getActivities();
    const index = all.findIndex(a => a.id === record.id);
    let newActivities;
    if (index >= 0) {
        newActivities = [...all];
        newActivities[index] = record;
    } else {
        newActivities = [record, ...all];
    }
    localStorage.setItem('agritrack_activities', JSON.stringify(newActivities));
    
    // 2. Send to Cloud
    await saveData('activity', record);
    
    notify('change');
  },

  deleteActivity: async (id: string) => {
    const all = await dbService.getActivities();
    const filtered = all.filter(a => a.id !== id);
    localStorage.setItem('agritrack_activities', JSON.stringify(filtered));
    notify('change');
    // Note: Deletion in cloud not implemented in this version for safety
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
    let newList;
    if (index >= 0) {
        newList = [...all];
        newList[index] = field;
    } else {
        newList = [...all, field];
    }
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
    let newList;
    if (index >= 0) {
        newList = [...all];
        newList[index] = storage;
    } else {
        newList = [...all, storage];
    }
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
    const s = localStorage.getItem('agritrack_settings_full');
    return s ? JSON.parse(s) : DEFAULT_SETTINGS;
  },

  saveSettings: async (settings: AppSettings) => {
    localStorage.setItem('agritrack_settings_full', JSON.stringify(settings));
    saveSettingsToStorage(settings);
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
