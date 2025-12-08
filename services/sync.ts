import { dbService } from './db';

// Echter Sync Service
export const syncData = async () => {
    console.log("[Sync] Start...");
    try {
        await dbService.syncActivities();
        console.log("[Sync] Erfolgreich abgeschlossen.");
        localStorage.setItem('lastSyncSuccess', new Date().toISOString());
        return true;
    } catch (e) {
        console.error("[Sync] Fehler:", e);
        throw e;
    }
};