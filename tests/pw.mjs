// Playwright: من تبعيات المشروع إن وُجدت، وإلا من التثبيت العام في بيئة التطوير.
let mod;
try {
  mod = await import('playwright');
} catch (_) {
  mod = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
}
export const { chromium } = mod;
