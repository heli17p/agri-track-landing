
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { auth, db, isCloudConfigured, saveData, loadLocalData, fetchCloudData, loadSettings, saveSettings as saveStorageSettings, fetchCloudSettings, hardReset as storageHardReset, fetchFarmMasterSettings } from './storage';
import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, FeedbackTicket, DEFAULT_SETTINGS, Equipment, EquipmentCategory, ActivityType } from '../types';

export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// Internal logs
let logs: string[] = [];
export const addLog = (msg: string) => {
    logs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (logs.length > 100) logs.pop();
};

// Event Listeners
type Listener = () => void;
const syncListeners: Listener[] = [];
const dbChangeListeners: Listener[] = [];

const notifySync = () => syncListeners.forEach(l => l());
const notifyDbChange = () => dbChangeListeners.forEach(l => l());

export const dbService = {
    getLogs: () => logs,
    logEvent: addLog,
    
    onSyncComplete: (cb: Listener) => {
        syncListeners.push(cb);
        return () => { const i = syncListeners.indexOf(cb); if(i >= 0) syncListeners.splice(i, 1); };
    },
    
    onDatabaseChange: (cb: Listener) => {
        dbChangeListeners.push(cb);
        return () => { const i = dbChangeListeners.indexOf(cb); if(i >= 0) dbChangeListeners.splice(i, 1); };
    },

    // --- Stats ---
    getGlobalUserCount: async (): Promise<number> => {
        if (!db) return 0;
        try {
            // Wir zählen die Dokumente in der settings Kollektion (1 pro User/Betrieb)
            // Hinweis: In Produktionsumgebungen mit Millionen Usern wäre ein Counter-Dokument besser.
            // Für AgriTrack Austria ist dieser direkte Query aktuell am genauesten.
            const snapshot = await db.collection("settings").get();
            return snapshot.size;
        } catch (e) {
            console.error("Fehler beim Abrufen der Nutzerstatistik", e);
            return 0;
        }
    },

    // --- Activities ---
    getActivities: async (): Promise<ActivityRecord[]> => {
        const local = loadLocalData('activity');
        return local;
    },
    
    saveActivity: async (activity: ActivityRecord) => {
        await saveData('activity', activity);
        notifyDbChange();
    },

    deleteActivity: async (id: string) => {
        const allActivities = loadLocalData('activity');
        const target = allActivities.find((a: any) => a.id === id);

        if (target && target.storageDistribution) {
            const storages = loadLocalData('storage');
            let storageChanged = false;

            Object.entries(target.storageDistribution).forEach(([storageId, amount]) => {
                const storeIndex = storages.findIndex((s: any) => s.id === storageId);
                if (storeIndex >= 0) {
                    const current = storages[storeIndex].currentLevel;
                    const capacity = storages[storeIndex].capacity;
                    const amountToAdd = Number(amount); 
                    if (!isNaN(amountToAdd)) {
                        storages[storeIndex].currentLevel = Math.min(capacity, current + amountToAdd);
                        storageChanged = true;
                    }
                }
            });

            if (storageChanged) {
                localStorage.setItem('agritrack_storage', JSON.stringify(storages));
                if (isCloudConfigured()) {
                    storages.forEach((s: any) => saveData('storage', s));
                }
            }
        }

        const remainingActivities = allActivities.filter((a: any) => a.id !== id);
        localStorage.setItem('agritrack_activities', JSON.stringify(remainingActivities));
        
        if (isCloudConfigured()) {
            try {
                await db.collection("activities").doc(id).delete();
            } catch (e) {
                console.error("Cloud delete failed", e);
            }
        }
        notifyDbChange();
    },

    getActivitiesForField: async (fieldId: string) => {
        const acts = loadLocalData('activity');
        return acts.filter((a: any) => a.fieldIds && a.fieldIds.includes(fieldId));
    },

    // --- Fields ---
    getFields: async (): Promise<Field[]> => {
        return loadLocalData('field');
    },

    saveField: async (field: Field) => {
        await saveData('field', field);
        notifyDbChange();
    },

    deleteField: async (id: string) => {
        let fields = loadLocalData('field');
        fields = fields.filter((f: any) => f.id !== id);
        localStorage.setItem('agritrack_fields', JSON.stringify(fields));
        
        if (isCloudConfigured()) {
            try { await db.collection("fields").doc(id).delete(); } catch(e) {}
        }
        notifyDbChange();
    },

    // --- Equipment ---
    getEquipment: async (): Promise<Equipment[]> => {
        return loadLocalData('equipment');
    },

    saveEquipment: async (equipment: Equipment) => {
        await saveData('equipment', equipment);
        notifyDbChange();
    },

    deleteEquipment: async (id: string) => {
        let items = loadLocalData('equipment');
        items = items.filter((s: any) => s.id !== id);
        localStorage.setItem('agritrack_equipment', JSON.stringify(items));
        if (isCloudConfigured()) {
            try { await db.collection("equipment").doc(id).delete(); } catch(e) {}
        }
        notifyDbChange();
    },

    // --- Equipment Categories (Typen) ---
    getEquipmentCategories: async (): Promise<EquipmentCategory[]> => {
        let cats = loadLocalData('tillage_categories' as any);
        if (!cats || cats.length === 0) {
            // Vordefinierte Gruppen für AgriTrack Austria
            cats = [
                { id: 'cat_slurry', name: 'Gülle', parentType: ActivityType.FERTILIZATION },
                { id: 'cat_manure', name: 'Mist', parentType: ActivityType.FERTILIZATION },
                { id: 'cat_harrow', name: 'Wiesenegge', parentType: ActivityType.TILLAGE },
                { id: 'cat_mulch', name: 'Schlegeln', parentType: ActivityType.TILLAGE },
                { id: 'cat_mower', name: 'Mähwerk', parentType: ActivityType.HARVEST }
            ];
            localStorage.setItem('agritrack_tillage_categories', JSON.stringify(cats));
        }
        return cats;
    },

    saveEquipmentCategory: async (category: EquipmentCategory) => {
        // Nutzt jetzt den zentralen Cloud-Helper inkl. Farm-ID Zuordnung
        await saveData('tillage_categories' as any, category);
        notifyDbChange();
    },

    deleteEquipmentCategory: async (id: string) => {
        let cats = loadLocalData('tillage_categories' as any);
        cats = cats.filter((c: any) => c.id !== id);
        localStorage.setItem('agritrack_tillage_categories', JSON.stringify(cats));
        
        if (isCloudConfigured()) {
            try { await db.collection("tillage_categories").doc(id).delete(); } catch(e) {}
        }
        notifyDbChange();
    },

    // --- Storage ---
    getStorageLocations: async (): Promise<StorageLocation[]> => {
        return loadLocalData('storage');
    },

    saveStorageLocation: async (storage: StorageLocation) => {
        await saveData('storage', storage);
        notifyDbChange();
    },

    updateStorageLevels: async (distribution: Record<string, number>) => {
        const storages = await dbService.getStorageLocations();
        let changed = false;

        const updatedStorages = storages.map(s => {
            if (distribution[s.id] && distribution[s.id] > 0) {
                const iLevel = s.currentLevel;
                const newLevel = Math.max(0, iLevel - distribution[s.id]);
                if (newLevel !== iLevel) {
                    changed = true;
                    return { ...s, currentLevel: newLevel };
                }
            }
            return s;
        });

        if (changed) {
            for (const s of updatedStorages) {
                await saveData('storage', s);
            }
            notifyDbChange();
        }
    },

    deleteStorage: async (id: string) => {
        let items = loadLocalData('storage');
        items = items.filter((s: any) => s.id !== id);
        localStorage.setItem('agritrack_storage', JSON.stringify(items));
        
        if(isCloudConfigured()) {
            try { await db.collection("storages").doc(id).delete(); } catch(e) {}
        }
        notifyDbChange();
    },

    processStorageGrowth: async () => {
        const storages = loadLocalData('storage');
        const lastCheck = localStorage.getItem('last_storage_growth_check');
        const now = Date.now();
        
        if (lastCheck) {
            const hours = (now - parseInt(lastCheck)) / (1000 * 60 * 60);
            if (hours > 0.016) {
                let changed = false;
                storages.forEach((s: any) => {
                    if (s.dailyGrowth > 0) {
                        const growth = (s.dailyGrowth / 24) * hours;
                        if(s.currentLevel < s.capacity) {
                            s.currentLevel = Math.min(s.capacity, s.currentLevel + growth);
                            changed = true;
                        }
                    }
                });
                
                if (changed) {
                    localStorage.setItem('agritrack_storage', JSON.stringify(storages));
                    notifyDbChange();
                    if(isCloudConfigured()) {
                        Promise.all(storages.map((s: any) => saveData('storage', s))).catch(console.error);
                    }
                }
                localStorage.setItem('last_storage_growth_check', now.toString());
            }
        } else {
            localStorage.setItem('last_storage_growth_check', now.toString());
        }
    },

    // --- Profile ---
    getFarmProfile: async (): Promise<FarmProfile[]> => {
        const p = loadLocalData('profile');
        return p ? [p] : [];
    },

    saveFarmProfile: async (profile: FarmProfile) => {
        await saveData('profile', profile);
        notifyDbChange();
    },

    // --- Settings ---
    getSettings: async (): Promise<AppSettings> => {
        return loadSettings();
    },

    saveSettings: async (settings: AppSettings) => {
        const currentUser = auth?.currentUser;
        if (currentUser && !settings.ownerEmail && settings.farmId) {
             settings.ownerEmail = currentUser.email || 'Unbekannt';
        }
        await saveStorageSettings(settings);
        notifyDbChange();
    },

    // --- Feedback ---
    getFeedback: async (): Promise<FeedbackTicket[]> => {
        if (!isCloudConfigured()) return [];
        try {
            const snapshot = await db.collection("feedback").get();
            return snapshot.docs.map(d => d.data() as FeedbackTicket);
        } catch (e) {
            console.error("Feedback fetch error", e);
            return [];
        }
    },

    saveFeedback: async (ticket: FeedbackTicket) => {
        if (!isCloudConfigured()) return;
        await db.collection("feedback").doc(ticket.id).set(ticket);
    },

    deleteFeedback: async (id: string) => {
        if (!isCloudConfigured()) return;
        await db.collection("feedback").doc(id).delete();
    },

    // --- Sync & Cloud Utils ---
    syncActivities: async () => {
        if (!isCloudConfigured()) return { success: false, message: 'Nicht eingeloggt.' };
        
        const currentLocalSettings = loadSettings();
        
        try {
            const userId = auth.currentUser!.uid;
            const mySettingsDoc = await db.collection("settings").doc(userId).get();
            if (!mySettingsDoc.exists && currentLocalSettings.farmId) {
                const resetSettings = { ...DEFAULT_SETTINGS };
                localStorage.setItem('agritrack_settings_full', JSON.stringify(resetSettings));
                window.location.reload();
                return { success: false, message: 'Hof-Zuordnung entfernt.' };
            }
        } catch(e) { console.error("Identity check failed", e); }

        const cloudActivities = await fetchCloudData('activity', true); 
        const cloudFields = await fetchCloudData('field', true);
        const cloudStorages = await fetchCloudData('storage', true);
        const cloudProfiles = await fetchCloudData('profile', true);
        const cloudEquipment = await fetchCloudData('equipment', true);
        const cloudCategories = await fetchCloudData('tillage_categories' as any, true);
        
        let updateCount = 0;
        if (cloudActivities.length > 0) { localStorage.setItem('agritrack_activities', JSON.stringify(cloudActivities)); updateCount += cloudActivities.length; }
        if (cloudFields.length > 0) { localStorage.setItem('agritrack_fields', JSON.stringify(cloudFields)); updateCount += cloudFields.length; }
        if (cloudStorages.length > 0) { localStorage.setItem('agritrack_storage', JSON.stringify(cloudStorages)); updateCount += cloudStorages.length; }
        if (cloudProfiles.length > 0) { localStorage.setItem('agritrack_profile', JSON.stringify(cloudProfiles[0])); updateCount += 1; }
        if (cloudEquipment.length > 0) { localStorage.setItem('agritrack_equipment', JSON.stringify(cloudEquipment)); updateCount += cloudEquipment.length; }
        if (cloudCategories.length > 0) { localStorage.setItem('agritrack_tillage_categories', JSON.stringify(cloudCategories)); updateCount += cloudCategories.length; }

        if (currentLocalSettings.farmId) {
            const masterSettings = await fetchFarmMasterSettings(currentLocalSettings.farmId);
            if (masterSettings) {
                const sharedKeys: (keyof AppSettings)[] = ['slurryLoadSize', 'manureLoadSize', 'spreadWidth', 'slurrySpreadWidth', 'manureSpreadWidth', 'minSpeed', 'maxSpeed', 'storageRadius', 'farmPin'];
                let settingsChanged = false;
                const newSettings = { ...currentLocalSettings };
                sharedKeys.forEach(key => { if (masterSettings[key] !== undefined && masterSettings[key] !== newSettings[key]) { (newSettings as any)[key] = masterSettings[key]; settingsChanged = true; } });
                if (settingsChanged) { localStorage.setItem('agritrack_settings_full', JSON.stringify(newSettings)); addLog("[Sync] Globale Hof-Einstellungen aktualisiert."); }
            }
        }

        notifySync();
        notifyDbChange();
        return { success: true, message: `${updateCount} Objekte vom Server geladen.` };
    },

    // --- Backup & Restore (JSON) ---
    exportBackup: async () => {
        const backup = {
            activities: loadLocalData('activity'),
            fields: loadLocalData('field'),
            storages: loadLocalData('storage'),
            profile: loadLocalData('profile'),
            equipment: loadLocalData('equipment'),
            categories: loadLocalData('tillage_categories' as any),
            settings: loadSettings(),
            exportDate: new Date().toISOString(),
            appVersion: '2.4.8'
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AgriTrack_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog("Backup-Datei exportiert.");
    },

    importBackup: async (file: File) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);
                    if (!data.fields || !data.settings) throw new Error("Ungültiges Backup-Format.");

                    if (data.activities) localStorage.setItem('agritrack_activities', JSON.stringify(data.activities));
                    if (data.fields) localStorage.setItem('agritrack_fields', JSON.stringify(data.fields));
                    if (data.storages) localStorage.setItem('agritrack_storage', JSON.stringify(data.storages));
                    if (data.profile) localStorage.setItem('agritrack_profile', JSON.stringify(data.profile));
                    if (data.equipment) localStorage.setItem('agritrack_equipment', JSON.stringify(data.equipment));
                    if (data.categories) localStorage.setItem('agritrack_tillage_categories', JSON.stringify(data.categories));
                    if (data.settings) localStorage.setItem('agritrack_settings_full', JSON.stringify(data.settings));

                    addLog("Backup-Datei erfolgreich importiert.");
                    notifyDbChange();
                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    },

    getFarmMembers: async (farmId: string) => {
        if (!isCloudConfigured()) return [];
        const snap = await db.collection("settings").where("farmId", "==", String(farmId)).get();
        return snap.docs.map(d => {
            const data = d.data();
            return {
                userId: d.id,
                email: data.ownerEmail || 'Unbekannt',
                lastUpdate: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString() : 'N/A'
            };
        });
    },

    removeFarmMember: async (userId: string) => {
        if (!isCloudConfigured()) return;
        await db.collection("settings").doc(userId).delete();
    },

    migrateGuestDataToCloud: async () => {
        if (!isCloudConfigured()) return;
        dbService.forceUploadToFarm(() => {}).catch(console.error);
    },

    verifyFarmPin: async (farmId: string, pin: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
        let allMatches: any[] = [];
        for (const id of idsToCheck) {
            const snap = await db.collection("settings").where("farmId", "==", id).get();
            snap.docs.forEach(d => allMatches.push(d.data()));
        }
        if (allMatches.length === 0) return { isNew: true, valid: false };
        allMatches.sort((a, b) => {
            const scoreA = (a.farmPin ? 2 : 0) + (a.ownerEmail ? 1 : 0);
            const scoreB = (b.farmPin ? 2 : 0) + (b.ownerEmail ? 1 : 0);
            return scoreB - scoreA; 
        });
        const bestMatch = allMatches[0];
        if (!pin) return { isNew: false, valid: false, ownerEmail: bestMatch.ownerEmail || bestMatch.userId };
        const validMatch = allMatches.find(d => d.farmPin === pin);
        return { isNew: false, valid: !!validMatch, ownerEmail: bestMatch.ownerEmail || bestMatch.userId };
    },

    forceUploadToFarm: async (progressCb: (status: string, percent: number) => void) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        try {
            progressCb('Prüfe Cloud-Verbindung...', 5);
            const pingPromise = dbService.testCloudConnection();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000));
            await Promise.race([pingPromise, timeoutPromise]);
        } catch (e) {
            console.warn("Ping failed, trying upload anyway...", e);
        }

        const acts = loadLocalData('activity') || [];
        const fields = loadLocalData('field') || [];
        const storages = loadLocalData('storage') || [];
        const equipment = loadLocalData('equipment') || [];
        const categories = loadLocalData('tillage_categories' as any) || [];
        const profile = loadLocalData('profile');
        
        const allItems = [
            ...acts.map((i: any) => ({ type: 'activity', data: i })),
            ...fields.map((i: any) => ({ type: 'field', data: i })),
            ...storages.map((i: any) => ({ type: 'storage', data: i })),
            ...equipment.map((i: any) => ({ type: 'equipment', data: i })),
            ...categories.map((i: any) => ({ type: 'tillage_categories', data: i })),
        ];
        if (profile) allItems.push({ type: 'profile', data: profile });

        const total = allItems.length;
        if (total === 0) {
            progressCb('0 lokale Daten gefunden.', 100);
            return;
        }

        let sent = 0;
        let failed = 0;

        for (const item of allItems) {
            const jsonSize = JSON.stringify(item.data).length;
            const sizeKB = (jsonSize / 1024).toFixed(1);
            const timeoutMs = 45000 + (jsonSize / 1024) * 1000;
            progressCb(`Sende ${item.type} (${sizeKB} KB)...`, Math.round((sent / total) * 100));
            try {
                const savePromise = saveData(item.type as any, item.data);
                const timePromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout`)), timeoutMs));
                await Promise.race([savePromise, timePromise]);
                sent++;
            } catch (e: any) {
                console.error(`Upload failed for ${item.type}:`, e);
                failed++;
                addLog(`[Upload] Fehler bei Item: ${e.message}`);
            }
        }
        const finalMsg = failed > 0 ? `Fertig. ${sent} gesendet, ${failed} fehlgeschlagen.` : `Upload erfolgreich! ${sent} Objekte gesichert.`;
        progressCb(finalMsg, 100);
    },

    testCloudConnection: async () => {
        if (!isCloudConfigured()) throw new Error("Nicht eingeloggt.");
        const ref = db.collection("_ping_").doc();
        await ref.set({ time: Date.now() });
        await ref.delete();
        return { message: "Verbindung OK (Write/Delete)" };
    },

    hardReset: storageHardReset,

    deleteEntireFarm: async (farmId: string, pin: string, progressCb: (msg: string) => void) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        const collections = ['activities', 'fields', 'storages', 'profiles', 'settings', 'equipment', 'tillage_categories'];
        let deletedCount = 0;
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
        for (const col of collections) {
            progressCb(`Lösche ${col}...`);
            for (const id of idsToCheck) {
                const snap = await db.collection(col).where("farmId", "==", id).get();
                const batch = db.batch();
                let i = 0;
                for (const d of snap.docs) {
                    const data = d.data();
                    if (data.farmPin && data.farmPin !== pin) continue;
                    batch.delete(d.ref);
                    i++;
                    deletedCount++;
                    if (i >= 400) { await batch.commit(); i=0; }
                }
                if (i > 0) await batch.commit();
            }
        }
        return deletedCount;
    },

    inspectCloudData: async (farmId: string) => {
        if (!isCloudConfigured()) return { error: "Offline" };
        try {
            const idsToCheck = [String(farmId)];
            const numId = Number(farmId);
            if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
            const res: any = { activities: [], fields: [], storages: [], profiles: [], equipment: [], categories: [] };
            await Promise.all(idsToCheck.map(async (id) => {
                const [a, f, s, p, e, c] = await Promise.all([
                    db.collection("activities").where("farmId", "==", id).get(),
                    db.collection("fields").where("farmId", "==", id).get(),
                    db.collection("storages").where("farmId", "==", id).get(),
                    db.collection("profiles").where("farmId", "==", id).get(),
                    db.collection("equipment").where("farmId", "==", id).get(),
                    db.collection("tillage_categories").where("farmId", "==", id).get()
                ]);
                a.docs.forEach(d => res.activities.push({id: d.id, ...d.data()}));
                f.docs.forEach(d => res.fields.push({id: d.id, ...d.data()}));
                s.docs.forEach(d => res.storages.push({id: d.id, ...d.data()}));
                p.docs.forEach(d => res.profiles.push({id: d.id, ...d.data()}));
                e.docs.forEach(d => res.equipment.push({id: d.id, ...d.data()}));
                c.docs.forEach(d => res.categories.push({id: d.id, ...d.data()}));
            }));
            return res;
        } catch (e) { return { error: e }; }
    },

    getLocalStats: async () => {
        const acts = (loadLocalData('activity') || []).length;
        const fields = (loadLocalData('field') || []).length;
        const storages = (loadLocalData('storage') || []).length;
        const equip = (loadLocalData('equipment') || []).length;
        return { total: acts + fields + storages + equip };
    },

    getCloudStats: async (farmId: string) => {
        if (!isCloudConfigured()) return { total: -1, activities: 0, fields: 0, storages: 0, profiles: 0, equipment: 0 };
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
        try {
            let aCount = 0, fCount = 0, sCount = 0, pCount = 0, eCount = 0;
            await Promise.all(idsToCheck.map(async (id) => {
                const [a, f, s, p, e] = await Promise.all([
                    db.collection("activities").where("farmId", "==", id).get(),
                    db.collection("fields").where("farmId", "==", id).get(),
                    db.collection("storages").where("farmId", "==", id).get(),
                    db.collection("profiles").where("farmId", "==", id).get(),
                    db.collection("equipment").where("farmId", "==", id).get()
                ]);
                aCount += a.size; fCount += f.size; sCount += s.size; pCount += p.size; eCount += e.size;
            }));
            return { total: aCount + fCount + sCount + pCount + eCount, activities: aCount, fields: fCount, storages: sCount, profiles: pCount, equipment: eCount };
        } catch (e) {
            console.error("Stats Error", e);
            return { total: -1, activities: 0, fields: 0, storages: 0, profiles: 0, equipment: 0 };
        }
    },

    getCurrentUserInfo: () => {
        if (!auth?.currentUser) return { status: 'Offline' };
        return { status: 'Eingeloggt', email: auth.currentUser.email, uid: auth.currentUser.uid };
    },

    analyzeDataTypes: async (farmId: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        const results = { stringIdCount: 0, numberIdCount: 0, details: [] as string[] };
        const qStr = db.collection("activities").where("farmId", "==", String(farmId));
        const snapStr = await qStr.get();
        results.stringIdCount = snapStr.size;
        const numId = Number(farmId);
        if (!isNaN(numId)) {
            const qNum = db.collection("activities").where("farmId", "==", numId);
            const snapNum = await qNum.get();
            results.numberIdCount = snapNum.size;
        }
        results.details.push(`Gefunden: ${results.stringIdCount} als Text, ${results.numberIdCount} als Zahl.`);
        return results;
    },

    repairDataTypes: async (farmId: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        const numId = Number(farmId);
        if (isNaN(numId)) return "Farm ID ist keine Zahl, keine Reparatur nötig.";
        const collections = ['activities', 'fields', 'storages', 'settings', 'equipment', 'tillage_categories']; 
        let totalFixed = 0;
        for (const col of collections) {
            const qNum = db.collection(col).where("farmId", "==", numId);
            const snap = await qNum.get();
            if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(d => { batch.update(d.ref, { farmId: String(farmId) }); totalFixed++; });
                await batch.commit();
            }
        }
        return `Reparatur fertig: ${totalFixed} Dokumente auf Text-ID aktualisiert.`;
    },

    findFarmConflicts: async (farmId: string) => {
        if (!isCloudConfigured()) return [];
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
        let allDocs: any[] = [];
        for (const id of idsToCheck) {
            try {
                const snap = await db.collection("settings").where("farmId", "==", id).get();
                snap.docs.forEach(d => {
                    const data = d.data();
                    allDocs.push({ docId: d.id, farmIdStored: data.farmId, farmIdType: typeof data.farmId, email: data.userId || data.ownerEmail, hasPin: !!data.farmPin, updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString() : 'N/A' });
                });
            } catch (e) { console.warn(`Zugriff auf Settings verweigert.`); }
        }
        return allDocs;
    },

    deleteSettingsDoc: async (docId: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        await db.collection("settings").doc(docId).delete();
    },

    forceDeleteSettings: async (farmId: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);
        const batch = db.batch();
        let count = 0; let permissionErrors = 0;
        for(const id of idsToCheck) {
            try {
                const q = db.collection('settings').where("farmId", "==", id);
                const snap = await q.get({ source: 'server' });
                snap.docs.forEach(d => { try { batch.delete(d.ref); count++; } catch(err) { permissionErrors++; } });
            } catch (e: any) {
                console.warn(`Löschen fehlgeschlagen:`, e);
                if (e.message?.includes('permission') || e.code === 'permission-denied') permissionErrors++;
            }
        }
        if(count > 0) { await batch.commit(); return { success: true, count, permissionErrors }; } 
        return { success: true, count: 0, permissionErrors };
    },

    adminGetAllFarms: async () => {
        if (!isCloudConfigured()) return [];
        const snap = await db.collection("settings").get();
        return snap.docs.map(d => {
            const data = d.data();
            return { docId: d.id, farmId: data.farmId, farmIdType: typeof data.farmId, ownerEmail: data.userId || data.ownerEmail, hasPin: !!data.farmPin, updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString() : 'N/A' };
        });
    }
};

