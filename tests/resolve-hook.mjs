// يُنفَّذ داخل خيط الخطّافات: أي استيراد لـ'@netlify/blobs' يُحلّ إلى البديل في الذاكرة.
const DOUBLE = new URL('./doubles/netlify-blobs.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@netlify/blobs') return { url: DOUBLE, shortCircuit: true };
  return nextResolve(specifier, context);
}
