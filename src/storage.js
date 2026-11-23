// Speicher: IndexedDB mit localStorage als Rückfall. Hält nur den aktuellen Entwurf.
const DB = 'stempel-studio', STORE = 'meta', DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, DB_VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function getMeta(key) {
  const db = await openDb();
  if (!db) { try { const v = localStorage.getItem(`${DB}:${key}`); return v ? JSON.parse(v) : null; } catch { return null; } }
  return new Promise(resolve => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function setMeta(key, value) {
  const db = await openDb();
  if (!db) { try { localStorage.setItem(`${DB}:${key}`, JSON.stringify(value)); } catch { /* voll oder gesperrt */ } return; }
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
