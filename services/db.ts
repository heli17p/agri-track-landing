
import firebase from 'firebase/app';
import 'firebase/firestore';
import { auth, db, isCloudConfigured, saveData, loadLocalData, fetchCloudData, loadSettings, saveSettings as saveStorageSettings, fetchCloudSettings, hardReset as storageHardReset } from './storage';
import { ActivityRecord, Field, StorageLocation, FarmProfile, AppSettings, FeedbackTicket, DEFAULT_SETTINGS } from '../types';

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
        let activities = loadLocalData('activity');
        activities = activities.filter((a: any) => a.id !== id);
        localStorage.setItem('agritrack_activities', JSON.stringify(activities));
        
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

        // Iterate through all storages and deduct amount if present in distribution
        const updatedStorages = storages.map(s => {
            if (distribution[s.id] && distribution[s.id] > 0) {
                // Deduct amount, prevent negative values
                const newLevel = Math.max(0, s.currentLevel - distribution[s.id]);
                if (newLevel !== s.currentLevel) {
                    changed = true;
                    return { ...s, currentLevel: newLevel };
                }
            }
            return s;
        });

        if (changed) {
            // Save updates
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
            if (hours > 1) {
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
                    if(isCloudConfigured()) {
                        for(const s of storages) {
                            await saveData('storage', s);
                        }
                    }
                }
            }
        }
        localStorage.setItem('last_storage_growth_check', now.toString());
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
        // Beim Speichern der Einstellungen (z.B. beim Erstellen eines Hofes)
        // fügen wir automatisch die Email des aktuellen Users als "Owner" hinzu,
        // falls noch kein Owner eingetragen ist.
        const currentUser = auth?.currentUser;
        if (currentUser && !settings.ownerEmail && settings.farmId) {
             settings.ownerEmail = currentUser.email || 'Unbekannt';
        }
        await saveStorageSettings(settings);
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
        if (!isCloudConfigured()) return;
        
        const cloudActivities = await fetchCloudData('activity', true); 
        const cloudFields = await fetchCloudData('field', true);
        const cloudStorages = await fetchCloudData('storage', true);
        const cloudProfiles = await fetchCloudData('profile', true);
        
        if (cloudActivities.length > 0) localStorage.setItem('agritrack_activities', JSON.stringify(cloudActivities));
        if (cloudFields.length > 0) localStorage.setItem('agritrack_fields', JSON.stringify(cloudFields));
        if (cloudStorages.length > 0) localStorage.setItem('agritrack_storage', JSON.stringify(cloudStorages));
        if (cloudProfiles.length > 0) localStorage.setItem('agritrack_profile', JSON.stringify(cloudProfiles[0]));

        notifySync();
    },

    migrateGuestDataToCloud: async () => {
        if (!isCloudConfigured()) return;
        // Non-blocking upload trigger
        dbService.forceUploadToFarm(() => {}).catch(console.error);
    },

    verifyFarmPin: async (farmId: string, pin: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        
        // Suche nach BEIDEN ID-Typen (String und Number)
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

        let allMatches: any[] = [];

        for (const id of idsToCheck) {
            const snap = await db.collection("settings").where("farmId", "==", id).get();
            snap.docs.forEach(d => allMatches.push(d.data()));
        }
        
        if (allMatches.length === 0) {
            return { isNew: true, valid: false };
        }
        
        // Priorisiere den "echten" Hof (der mit PIN und Owner)
        // Sort: Has PIN & Email > Has PIN > Has Email > Empty
        allMatches.sort((a, b) => {
            const scoreA = (a.farmPin ? 2 : 0) + (a.ownerEmail ? 1 : 0);
            const scoreB = (b.farmPin ? 2 : 0) + (b.ownerEmail ? 1 : 0);
            return scoreB - scoreA; // Descending
        });

        const bestMatch = allMatches[0];
        
        // Wenn kein PIN übergeben wurde (reiner Check)
        if (!pin) {
             return { 
                 isNew: false, 
                 valid: false, // Valid is false because we didn't check PIN
                 ownerEmail: bestMatch.ownerEmail || bestMatch.userId 
             };
        }

        // Check PIN against ALL matches that have a PIN (in case of duplicates)
        const validMatch = allMatches.find(d => d.farmPin === pin);
        return { 
            isNew: false, 
            valid: !!validMatch, 
            ownerEmail: bestMatch.ownerEmail || bestMatch.userId 
        };
    },

    forceUploadToFarm: async (progressCb: (status: string, percent: number) => void) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        
        // Verbindungs-Test vorab (Schneller Check)
        try {
            progressCb('Prüfe Cloud-Verbindung...', 5);
            // Timeout für Ping (7s)
            const pingPromise = dbService.testCloudConnection();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 7000));
            await Promise.race([pingPromise, timeoutPromise]);
        } catch (e) {
            console.warn("Ping failed, trying upload anyway...", e);
        }

        const acts = loadLocalData('activity') || [];
        const fields = loadLocalData('field') || [];
        const storages = loadLocalData('storage') || [];
        const profile = loadLocalData('profile');
        
        const allItems = [
            ...acts.map((i: any) => ({ type: 'activity', data: i })),
            ...fields.map((i: any) => ({ type: 'field', data: i })),
            ...storages.map((i: any) => ({ type: 'storage', data: i })),
        ];
        if (profile) allItems.push({ type: 'profile', data: profile });

        const total = allItems.length;
        if (total === 0) {
            progressCb('0 lokale Daten gefunden.', 100);
            return;
        }

        let sent = 0;
        let failed = 0;

        // Einzel-Upload für große Datenmengen (stabiler)
        for (const item of allItems) {
            const jsonSize = JSON.stringify(item.data).length;
            const sizeKB = (jsonSize / 1024).toFixed(1);
            
            // Dynamisches Timeout basierend auf Größe (min 45s, +1s pro KB)
            const timeoutMs = 45000 + (jsonSize / 1024) * 1000;
            
            progressCb(`Sende ${item.type} (${sizeKB} KB)...`, Math.round((sent / total) * 100));

            try {
                // Wrap save in timeout promise
                const savePromise = saveData(item.type as any, item.data);
                const timePromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${Math.round(timeoutMs/1000)}s)`)), timeoutMs));
                
                await Promise.race([savePromise, timePromise]);
                sent++;
            } catch (e: any) {
                console.error(`Upload failed for ${item.type}:`, e);
                failed++;
                addLog(`[Upload] Fehler bei Item: ${e.message}`);
            }
        }

        const finalMsg = failed > 0 
            ? `Fertig. ${sent} gesendet, ${failed} fehlgeschlagen. Bitte erneut versuchen.` 
            : `Upload erfolgreich! ${sent} Objekte gesichert.`;
            
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
        
        // Parallel Delete Strategy
        const collections = ['activities', 'fields', 'storages', 'profiles', 'settings'];
        let deletedCount = 0;

        // Try both String and Number ID variants to be clean
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
                    // Security check (if PIN is stored on doc)
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
            // Check both ID types
            const idsToCheck = [String(farmId)];
            const numId = Number(farmId);
            if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

            const res: any = { activities: [], fields: [], storages: [], profiles: [] };
            
            // Execute parallel queries for speed
            await Promise.all(idsToCheck.map(async (id) => {
                const [a, f, s, p] = await Promise.all([
                    db.collection("activities").where("farmId", "==", id).get(),
                    db.collection("fields").where("farmId", "==", id).get(),
                    db.collection("storages").where("farmId", "==", id).get(),
                    db.collection("profiles").where("farmId", "==", id).get()
                ]);

                a.docs.forEach(d => res.activities.push({id: d.id, ...d.data(), farmIdType: typeof d.data().farmId}));
                f.docs.forEach(d => res.fields.push({id: d.id, ...d.data()}));
                s.docs.forEach(d => res.storages.push({id: d.id, ...d.data()}));
                p.docs.forEach(d => res.profiles.push({id: d.id, ...d.data()}));
            }));

            return res;
        } catch (e) {
            return { error: e };
        }
    },

    getLocalStats: async () => {
        const acts = (loadLocalData('activity') || []).length;
        const fields = (loadLocalData('field') || []).length;
        const storages = (loadLocalData('storage') || []).length;
        return { total: acts + fields + storages };
    },

    getCloudStats: async (farmId: string) => {
        if (!isCloudConfigured()) return { total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 };
        
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

        try {
            let aCount = 0, fCount = 0, sCount = 0, pCount = 0;

            await Promise.all(idsToCheck.map(async (id) => {
                const [a, f, s, p] = await Promise.all([
                    db.collection("activities").where("farmId", "==", id).get(),
                    db.collection("fields").where("farmId", "==", id).get(),
                    db.collection("storages").where("farmId", "==", id).get(),
                    db.collection("profiles").where("farmId", "==", id).get()
                ]);
                aCount += a.size;
                fCount += f.size;
                sCount += s.size;
                pCount += p.size;
            }));

            return { 
                total: aCount + fCount + sCount + pCount, 
                activities: aCount, 
                fields: fCount, 
                storages: sCount,
                profiles: pCount
            };
        } catch (e) {
            console.error("Stats Error", e);
            // Return -1 to indicate error/offline
            return { total: -1, activities: 0, fields: 0, storages: 0, profiles: 0 };
        }
    },

    getCurrentUserInfo: () => {
        if (!auth?.currentUser) return { status: 'Offline' };
        return {
            status: 'Eingeloggt',
            email: auth.currentUser.email,
            uid: auth.currentUser.uid
        };
    },

    analyzeDataTypes: async (farmId: string) => {
        if (!isCloudConfigured()) throw new Error("Offline");
        
        const results = { stringIdCount: 0, numberIdCount: 0, details: [] as string[] };
        
        // Check String
        const qStr = db.collection("activities").where("farmId", "==", String(farmId));
        const snapStr = await qStr.get();
        results.stringIdCount = snapStr.size;
        
        // Check Number
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

        const collections = ['activities', 'fields', 'storages', 'settings']; // Settings too!
        let totalFixed = 0;

        for (const col of collections) {
            const qNum = db.collection(col).where("farmId", "==", numId);
            const snap = await qNum.get();
            
            if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(d => {
                    batch.update(d.ref, { farmId: String(farmId) });
                    totalFixed++;
                });
                await batch.commit();
            }
        }
        
        return `Reparatur fertig: ${totalFixed} Dokumente auf Text-ID aktualisiert.`;
    },

    // --- ADMIN / CONFLICT RESOLUTION ---

    findFarmConflicts: async (farmId: string) => {
        if (!isCloudConfigured()) return [];
        
        const idsToCheck = [String(farmId)];
        const numId = Number(farmId);
        if(!isNaN(numId) && String(numId) === String(farmId)) idsToCheck.push(numId as any);

        let allDocs: any[] = [];
        
        for (const id of idsToCheck) {
            // We use try-catch here because accessing settings of others might be restricted
            // But usually settings collection is readable if knowing the ID
            try {
                const snap = await db.collection("settings").where("farmId", "==", id).get();
                snap.docs.forEach(d => {
                    const data = d.data();
                    allDocs.push({
                        docId: d.id,
                        farmIdStored: data.farmId,
                        farmIdType: typeof data.farmId,
                        email: data.userId || data.ownerEmail, 
                        hasPin: !!data.farmPin,
                        updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString() : 'N/A'
                    });
                });
            } catch (e) {
                console.warn(`Zugriff auf Settings für ID ${id} verweigert oder leer.`);
            }
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
        let count = 0;
        let permissionErrors = 0;

        for(const id of idsToCheck) {
            try {
                // IMPORTANT: Use getDocsFromServer to ensure we are not checking an empty cache
                const q = db.collection('settings').where("farmId", "==", id);
                const snap = await q.get({ source: 'server' });
                
                snap.docs.forEach(d => {
                    try {
                        batch.delete(d.ref);
                        count++;
                    } catch(err) {
                        permissionErrors++;
                    }
                });
            } catch (e: any) {
                console.warn(`Löschen für ID-Variante '${id}' fehlgeschlagen:`, e);
                // Catch permission denied explicitly
                if (e.message?.includes('permission') || e.code === 'permission-denied' || e.message?.includes('Failed to get documents')) {
                    permissionErrors++;
                }
            }
        }

        if(count > 0) {
            await batch.commit();
            addLog(`Notfall-Bereinigung: ${count} Settings-Dokumente für ID '${farmId}' gelöscht.`);
            return { success: true, count, permissionErrors };
        } else {
            addLog(`Notfall-Bereinigung: Keine Dokumente gefunden für ID '${farmId}' (Permission Errors: ${permissionErrors}).`);
            return { success: true, count: 0, permissionErrors };
        }
    },

    adminGetAllFarms: async () => {
        if (!isCloudConfigured()) return [];
        // Note: This query usually requires Admin SDK or open rules.
        // It will likely fail for normal users, which is expected.
        const snap = await db.collection("settings").get();
        return snap.docs.map(d => {
            const data = d.data();
            return {
                docId: d.id,
                farmId: data.farmId,
                farmIdType: typeof data.farmId,
                ownerEmail: data.userId || data.ownerEmail, 
                hasPin: !!data.farmPin,
                updatedAt: data.updatedAt ? new Date(data.updatedAt.seconds * 1000).toLocaleString() : 'N/A'
            };
        });
    }
};

