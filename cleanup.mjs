// پاک‌سازی پست‌ها و فایل‌های قدیمی‌تر از ۷ روز
const E = process.env.APPWRITE_ENDPOINT;
const P = process.env.APPWRITE_PROJECT;
const K = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB;
const COL = process.env.APPWRITE_COLLECTION;
const BUCKET = process.env.APPWRITE_BUCKET;
const DAYS = 7;

const headers = { 'X-Appwrite-Project': P, 'X-Appwrite-Key': K, 'Content-Type': 'application/json' };
const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();

async function api(method, path, query) {
  const url = new URL(E + path);
  (query || []).forEach(q => url.searchParams.append('queries[]', q));
  const res = await fetch(url, { method, headers });
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

let deletedPosts = 0, deletedFiles = 0;
for (;;) {
  const q = [
    JSON.stringify({ method: 'lessThan', attribute: '$createdAt', values: [cutoff] }),
    JSON.stringify({ method: 'limit', values: [100] })
  ];
  const res = await api('GET', `/databases/${DB}/collections/${COL}/documents`, q);
  const docs = (res && res.documents) || [];
  if (!docs.length) break;
  for (const d of docs) {
    if (d.fileId && d.fileId !== 'none') {
      await api('DELETE', `/storage/buckets/${BUCKET}/files/${d.fileId}`);
      deletedFiles++;
    }
    await api('DELETE', `/databases/${DB}/collections/${COL}/documents/${d.$id}`);
    deletedPosts++;
  }
}
console.log(`Deleted ${deletedPosts} posts and ${deletedFiles} files older than ${DAYS} days.`);
