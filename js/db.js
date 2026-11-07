// RiderHQ — IndexedDB storage (no dependencies).
const DB_NAME = 'ridehq';
const DB_VERSION = 1;
const STORES = {
  rides: { keyPath: 'id', indexes: [['startUtc', 'startUtc']] },
  streams: { keyPath: 'id' },
  raw: { keyPath: 'id' },
  wellness: { keyPath: 'date' },
  settings: { keyPath: 'key' },
  plans: { keyPath: 'id' },
  gymlog: { keyPath: 'id', indexes: [['date', 'date']] },
  equipment: { keyPath: 'id' },
  ai: { keyPath: 'id', indexes: [['ts', 'ts']] },
  inbox: { keyPath: 'id' },
  planlog: { keyPath: 'id' },
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const st = db.createObjectStore(name, { keyPath: def.keyPath });
          for (const [idx, path] of def.indexes || []) st.createIndex(idx, path);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked by another tab'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  }));
}
const wrap = req => ({ __req: req });

export const db = {
  get: (store, key) => tx(store, 'readonly', s => wrap(s.get(key))),
  getAll: (store) => tx(store, 'readonly', s => wrap(s.getAll())),
  getAllKeys: (store) => tx(store, 'readonly', s => wrap(s.getAllKeys())),
  put: (store, value) => tx(store, 'readwrite', s => wrap(s.put(value))),
  bulkPut: (store, values) => tx(store, 'readwrite', s => { for (const v of values) s.put(v); return values.length; }),
  delete: (store, key) => tx(store, 'readwrite', s => wrap(s.delete(key))),
  clear: (store) => tx(store, 'readwrite', s => wrap(s.clear())),
  count: (store) => tx(store, 'readonly', s => wrap(s.count())),
  async getSetting(key, fallback = null) { const r = await this.get('settings', key); return r ? r.value : fallback; },
  async setSetting(key, value) { return this.put('settings', { key, value, updatedAt: Date.now() }); },
};

export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage, quota: e.quota }; }
  } catch { /* ignore */ }
  return null;
}
export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}
