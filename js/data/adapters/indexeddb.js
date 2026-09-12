// محوّل IndexedDB: التنفيذ الفعلي للتخزين.
// هذا هو الملف الوحيد الذي يُستبدل بمحوّل خادم لاحقًا، بشرط أن يحقق الواجهة نفسها:
// init, get, getAll, getByIndex, put, putMany, delete, deleteMany, clear, count, replaceAll.

const DB_NAME = 'motabiq';
const DB_VERSION = 1;

const STORE_DEFS = {
  clients: { keyPath: 'id', indexes: ['phone', 'stage', 'updatedAt'] },
  properties: { keyPath: 'id', indexes: ['city', 'district', 'type', 'status', 'ownerId', 'tourId', 'captureStatus', 'updatedAt'] },
  tours: { keyPath: 'id', indexes: ['date'] },
  requests: { keyPath: 'id', indexes: ['clientId', 'status'] },
  matches: { keyPath: 'id', indexes: ['requestId', 'propertyId', 'status'] },
  externalListings: { keyPath: 'id', indexes: ['status'] },
  deals: { keyPath: 'id', indexes: ['propertyId', 'clientId', 'date'] },
  images: { keyPath: 'id', indexes: ['entityId'] },
  settings: { keyPath: 'key', indexes: [] },
};

let dbPromise = null;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('أُلغيت المعاملة'));
  });
}

function upgrade(db, oldVersion, tx) {
  // الإصدار ١: إنشاء كل المخازن والفهارس.
  // الترقيات اللاحقة: ارفع DB_VERSION وأضف ما يلزم بحسب oldVersion؛ الحلقة أدناه تنشئ الناقص فقط.
  for (const [name, def] of Object.entries(STORE_DEFS)) {
    const store = db.objectStoreNames.contains(name)
      ? tx.objectStore(name)
      : db.createObjectStore(name, { keyPath: def.keyPath });
    for (const idx of def.indexes) {
      if (!store.indexNames.contains(idx)) store.createIndex(idx, idx, { unique: false });
    }
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('المتصفح لا يدعم IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error('قاعدة البيانات مفتوحة في تبويب آخر؛ أغلقه ثم أعد التحميل'));
  });
  return dbPromise;
}

async function readStore(store) {
  const db = await openDb();
  return db.transaction(store, 'readonly').objectStore(store);
}

export const indexedDbAdapter = {
  name: 'indexeddb',
  stores: Object.keys(STORE_DEFS),

  async init() { await openDb(); },

  async get(store, key) {
    return request((await readStore(store)).get(key));
  },

  async getAll(store) {
    return request((await readStore(store)).getAll());
  },

  async getByIndex(store, index, value) {
    return request((await readStore(store)).index(index).getAll(value));
  },

  async put(store, record) {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    await done(tx);
    return record;
  },

  async putMany(store, records) {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const rec of records) os.put(rec);
    await done(tx);
    return records;
  },

  async delete(store, key) {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await done(tx);
  },

  async deleteMany(store, keys) {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const key of keys) os.delete(key);
    await done(tx);
  },

  async clear(store) {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await done(tx);
  },

  async count(store) {
    return request((await readStore(store)).count());
  },

  /** يستبدل محتوى عدة مخازن في معاملة واحدة (الاستيراد). المخازن غير المذكورة لا تُمس. */
  async replaceAll(dataByStore) {
    const db = await openDb();
    const names = Object.keys(dataByStore);
    if (!names.length) return;
    const tx = db.transaction(names, 'readwrite');
    for (const name of names) {
      const os = tx.objectStore(name);
      os.clear();
      for (const rec of dataByStore[name]) os.put(rec);
    }
    await done(tx);
  },
};
