import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = 'https://edicut.com';
const assetDir = new URL('../apps/web/build/client/assets/', import.meta.url);
const results = [];
for (const path of ['/', '/health', '/signin', '/dashboard/projects/508eab87-82fd-4c91-87db-a38d2d91525b?version=e5ff741d-bc84-4f9e-8ea7-4927b3c87164']) {
  const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  results.push({ path, status: response.status, location: response.headers.get('location'), errorBoundary: body.includes('We couldn’t load this page'), ...(path === '/health' ? {health: JSON.parse(body)} : {}) });
}
const names = (await readdir(assetDir)).filter(name => /^(ProjectReviewPage-|review-frame-rate\.client-)/.test(name));
const missing = await fetch(`${base}/assets/player-audit-missing-20261015.js`, {signal: AbortSignal.timeout(20000)});
await missing.arrayBuffer();
results.push({path:'/assets/player-audit-missing-20261015.js',status:missing.status,expectedStatus:404,cacheControl:missing.headers.get('cache-control'),errorNotCached:missing.headers.get('cache-control')==='no-store'});
for (const name of names) {
  const response = await fetch(`${base}/assets/${name}`, {signal: AbortSignal.timeout(20000)});
  const remote = Buffer.from(await response.arrayBuffer());
  const local = await readFile(new URL(name, assetDir));
  const hash = data => createHash('sha256').update(data).digest('hex');
  results.push({asset:name,status:response.status,bytes:remote.length,sha256MatchesBuild:hash(remote)===hash(local)});
}
await writeFile(new URL('./player-live-verification-2026-10-15.json', import.meta.url), JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
if (results.some(item => item.errorBoundary || (item.expectedStatus ? item.status !== item.expectedStatus : item.status >= 400) || item.errorNotCached === false || item.sha256MatchesBuild === false || item.health?.ok === false)) process.exitCode = 1;
