// خطّاف استيراد: يوجّه '@netlify/blobs' إلى البديل الاختباري بلا تلويث node_modules.
// يُفعَّل بـ: node --import ./tests/loader.mjs …
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(new URL('./resolve-hook.mjs', import.meta.url), pathToFileURL('./'));
