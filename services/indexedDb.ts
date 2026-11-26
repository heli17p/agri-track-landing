export type CollectionType =
  | 'activity'
  | 'trip'
  | 'field'
  | 'storage'
  | 'profile'
  | 'equipment'
  | 'tillage_categories'
  | 'bales';

const DB_NAME = 'agritrack_local_db';
const DB_VERSION = 1;
const META_STORE = 'meta';

const STORE_MAP: Record<CollectionType, string> = {
  activity: 'activities',
  trip: 'trips',
  field: 'fields',
  storage: 'storages',
  profile: 'profile',
  equipment: 'equipment',
  tillage_categories: 'tillage_categories',
  bales: 'bales'
};

const LEGACY_LOCALSTORAGE_KEYS: Record<CollectionType, string> = {
  activity: 'agritrack_activities',
  trip: 'agritrack_trips',
  field: 'agritrack_fields',
  storage: 'agritrack_storage',
  profile: 'agritrack_profile',
  equipment: 'agritrack_equipment',
  tillage_categories: 'agritrack_tillage_categories',
  bales: 'agritrack_bales'
};

const ALL_COLLECTION_TYPES: CollectionType[] = [
  'activity',
  'trip',
  'field',
  'storage',
  'profile',
  'equipment',
  'tillage_categories',
  'bales'
];

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

const hasIndexedDb = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

const openRawDatabase = (): Promise<IDBDatabase> => {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.entries(STORE_MAP).forEach(([type, storeName]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            if (type === 'profile') {
              db.createObjectStore(storeName);
            } else {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          }
        });
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
};

const reqToPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });

const ensureMigrated = async (): Promise<IDBDatabase> => {
  const db = await openRawDatabase();
  if (!migrationPromise) {
    migrationPromise = (async () => {
      try {
        const metaTx = db.transaction(META_STORE, 'readonly');
        const alreadyMigrated = await reqToPromise(metaTx.objectStore(META_STORE).get('migrated_from_localstorage_v1'));
        await txDone(metaTx);
        if (alreadyMigrated) return;

        // Read legacy data from localStorage
        const legacyPayloads: Partial<Record<CollectionType, any>> = {};
        let foundAnyLegacy = false;

        for (const type of ALL_COLLECTION_TYPES) {
          const lsKey = LEGACY_LOCALSTORAGE_KEYS[type];
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed !== null && parsed !== undefined) {
                legacyPayloads[type] = parsed;
                foundAnyLegacy = true;
              }
            } catch {
              // Ignore corrupt legacy entry
            }
          }
        }

        const storesToWrite = [...Object.values(STORE_MAP), META_STORE];
        const writeTx = db.transaction(storesToWrite, 'readwrite');

        if (foundAnyLegacy) {
          for (const type of ALL_COLLECTION_TYPES) {
            const payload = legacyPayloads[type];
            if (!payload) continue;
            const store = writeTx.objectStore(STORE_MAP[type]);

            if (type === 'profile') {
              if (typeof payload === 'object') {
                store.put(payload, 'farm_profile');
              }
            } else if (Array.isArray(payload)) {
              payload.forEach((item: any, idx: number) => {
                if (!item || typeof item !== 'object') return;
                const safeItem = item.id ? item : { ...item, id: `migrated_${type}_${idx}_${Date.now()}` };
                store.put(safeItem);
              });
            }
          }
        }

        writeTx.objectStore(META_STORE).put(Date.now(), 'migrated_from_localstorage_v1');
        await txDone(writeTx);

        // Free up the 5 MB localStorage quota once safely persisted in IndexedDB
        if (foundAnyLegacy) {
          for (const type of ALL_COLLECTION_TYPES) {
            localStorage.removeItem(LEGACY_LOCALSTORAGE_KEYS[type]);
          }
          console.log('[AgriTrack DB] Lokale Daten erfolgreich in IndexedDB migriert.');
        }
      } catch (err) {
        console.warn('[AgriTrack DB] Migration warning:', err);
      }
    })();
  }
  await migrationPromise;
  return db;
};

// LocalStorage fallback helpers in case IndexedDB is unavailable in restricted contexts
const fallbackRead = (type: CollectionType): any => {
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS[type]);
    return raw ? JSON.parse(raw) : type === 'profile' ? null : [];
  } catch {
    return type === 'profile' ? null : [];
  }
};

const fallbackWriteAll = (type: CollectionType, data: any) => {
  try {
    localStorage.setItem(LEGACY_LOCALSTORAGE_KEYS[type], JSON.stringify(data));
  } catch (e) {
    console.error('[Storage Fallback] Write failed:', e);
  }
};

const sortCollection = (type: CollectionType, items: any[]): any[] => {
  if (type === 'activity' || type === 'trip') {
    return items.sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
  }
  if (type === 'bales') {
    return items.sort((a, b) => (b?.droppedAt || 0) - (a?.droppedAt || 0));
  }
  return items;
};

export const idbGetCollection = async <T = any>(type: CollectionType): Promise<T> => {
  if (!hasIndexedDb()) {
    return fallbackRead(type);
  }
  try {
    const db = await ensureMigrated();
    const storeName = STORE_MAP[type];
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);

    if (type === 'profile') {
      const val = await reqToPromise(store.get('farm_profile'));
      await txDone(tx);
      return (val ?? null) as T;
    }

    const items = await reqToPromise(store.getAll());
    await txDone(tx);
    return sortCollection(type, items || []) as unknown as T;
  } catch (err) {
    console.error(`[IndexedDB] Read error (${type}):`, err);
    return fallbackRead(type);
  }
};

export const idbUpsertItem = async (type: CollectionType, data: any): Promise<void> => {
  if (!hasIndexedDb()) {
    if (type === 'profile') {
      fallbackWriteAll(type, data);
      return;
    }
    const existing = fallbackRead(type);
    const idx = existing.findIndex((e: any) => e.id === data.id);
    if (idx >= 0) existing[idx] = data;
    else existing.unshift(data);
    fallbackWriteAll(type, existing);
    return;
  }

  try {
    const db = await ensureMigrated();
    const storeName = STORE_MAP[type];
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    if (type === 'profile') {
      store.put(data, 'farm_profile');
    } else {
      const safeItem = data?.id ? data : { ...data, id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      store.put(safeItem);
    }

    await txDone(tx);
  } catch (err) {
    console.error(`[IndexedDB] Upsert error (${type}):`, err);
    throw err;
  }
};

export const idbReplaceCollection = async (type: CollectionType, data: any): Promise<void> => {
  if (!hasIndexedDb()) {
    fallbackWriteAll(type, data);
    return;
  }

  try {
    const db = await ensureMigrated();
    const storeName = STORE_MAP[type];
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();

    if (type === 'profile') {
      if (data) store.put(data, 'farm_profile');
    } else if (Array.isArray(data)) {
      data.forEach((item: any, idx: number) => {
        if (!item || typeof item !== 'object') return;
        const safeItem = item.id ? item : { ...item, id: `item_${type}_${idx}_${Date.now()}` };
        store.put(safeItem);
      });
    }

    await txDone(tx);
  } catch (err) {
    console.error(`[IndexedDB] Replace error (${type}):`, err);
    throw err;
  }
};

export const idbDeleteItem = async (type: CollectionType, id: string): Promise<void> => {
  if (!hasIndexedDb()) {
    if (type === 'profile') {
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEYS[type]);
      return;
    }
    const existing = fallbackRead(type);
    fallbackWriteAll(type, existing.filter((e: any) => e.id !== id));
    return;
  }

  try {
    const db = await ensureMigrated();
    const storeName = STORE_MAP[type];
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(type === 'profile' ? 'farm_profile' : id);
    await txDone(tx);
  } catch (err) {
    console.error(`[IndexedDB] Delete error (${type}):`, err);
    throw err;
  }
};

export const idbClearAll = async (): Promise<void> => {
  for (const type of ALL_COLLECTION_TYPES) {
    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEYS[type]);
  }
  if (!hasIndexedDb()) return;

  try {
    const db = await ensureMigrated();
    const stores = [...Object.values(STORE_MAP), META_STORE];
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(name => tx.objectStore(name).clear());
    await txDone(tx);
  } catch (err) {
    console.error('[IndexedDB] Clear error:', err);
  }
};

export const getIndexedDbStorageEstimate = async (): Promise<{ usageMB: number; quotaMB: number } | null> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      const usageMB = Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10;
      const quotaMB = Math.round(((est.quota || 0) / (1024 * 1024)) * 10) / 10;
      return { usageMB, quotaMB };
    }
  } catch {
    // Ignore unsupported environments
  }
  return null;
};
