// بديل اختباري في الذاكرة لـ@netlify/blobs — يُستعمل في الاختبارات المحلية فقط
// كي يعمل كود الدوال الحقيقي كما هو بلا حساب Netlify ولا شبكة. لا يُنشر ولا يُستورد من التطبيق.

const stores = new Map();
const backing = (name) => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};

export function getStore(input) {
  const name = typeof input === 'string' ? input : input.name;
  const map = backing(name);
  return {
    async set(key, value, opts = {}) { map.set(key, { value, metadata: opts.metadata || {} }); },
    async setJSON(key, value, opts = {}) { map.set(key, { value: JSON.stringify(value), metadata: opts.metadata || {} }); },
    async get(key, opts = {}) {
      const rec = map.get(key);
      if (!rec) return null;
      if (opts.type === 'json') return JSON.parse(rec.value);
      if (opts.type === 'arrayBuffer') return Buffer.from(rec.value);
      return rec.value;
    },
    async getWithMetadata(key, opts = {}) {
      const rec = map.get(key);
      if (!rec) return null;
      return { data: opts.type === 'arrayBuffer' ? Buffer.from(rec.value) : rec.value, etag: 'x', metadata: rec.metadata };
    },
    async getMetadata(key) {
      const rec = map.get(key);
      return rec ? { etag: 'x', metadata: rec.metadata } : null;
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: 'x' })), directories: [] };
    },
    async delete(key) { map.delete(key); },
  };
}
export const getDeployStore = getStore;
