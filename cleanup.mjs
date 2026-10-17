// پاک‌سازی روزانه
const E = process.env.APPWRITE_ENDPOINT, P = process.env.APPWRITE_PROJECT, K = process.env.APPWRITE_KEY;
const DB = process.env.APPWRITE_DB, POSTS = process.env.APPWRITE_COLLECTION, MSGS = process.env.APPWRITE_MESSAGES;
const ACTIONS = process.env.APPWRITE_ACTIONS, BUCKET = process.env.APPWRITE_BUCKET;
const DAYS = 7;
const headers = { 'X-Appwrite-Project': P, 'X-Appwrite-Key': K, 'Content-Type': 'application/json' };
const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString();
const dayAgo = new Date(Date.now() - 864e5).toISOString();

async function api(method, path, queries) {
  const url = new URL(E + path);
  (queries || []).forEach(q => url.searchParams.append('queries[]', q));
  const res = await fetch(url, { method, headers });
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}
const q = (method, attribute, value) => JSON.stringify({ method, attribute, values: [value] });
const lim = n => JSON.stringify({ method: 'limit', values: [n] });
const off = n => JSON.stringify({ method: 'offset', values: [n] });
const delFile = async id => { if (id && id !== 'none') await api('DELETE', `/storage/buckets/${BUCKET}/files/${id}`); };
const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

let posts = 0, files = 0, msgs = 0, acts = 0, users = 0;

// 1) پست‌های قدیمی و فایل‌هاشون
for (;;) {
  const res = await api('GET', `/databases/${DB}/collections/${POSTS}/documents`, [q('lessThan', '$createdAt', cutoff), lim(100)]);
  const docs = (res && res.documents) || [];
  if (!docs.length) break;
  for (const d of docs) { if (d.fileId && d.fileId !== 'none') { await delFile(d.fileId); files++; } await api('DELETE', `/databases/${DB}/collections/${POSTS}/documents/${d.$id}`); posts++; }
}

// 2) پیام‌های چت (عمومی و خصوصی)
if (MSGS) for (;;) {
  const res = await api('GET', `/databases/${DB}/collections/${MSGS}/documents`, [q('lessThan', '$createdAt', cutoff), lim(100)]);
  const docs = (res && res.documents) || [];
  if (!docs.length) break;
  for (const d of docs) { await api('DELETE', `/databases/${DB}/collections/${MSGS}/documents/${d.$id}`); msgs++; }
}

// 3) لایک، کامنت، ذخیره، رأی، بازدید، متا و ... بعد از ۷ روز؛ استوری بعد از ۱ روز
if (ACTIONS) {
  const drop = new Set(['like', 'dislike', 'comment', 'save', 'vote', 'poll', 'meta', 'pincm', 'react', 'view']);
  for (let offset = 0; ; ) {
    const res = await api('GET', `/databases/${DB}/collections/${ACTIONS}/documents`, [q('lessThan', '$createdAt', dayAgo), lim(100), off(offset)]);
    const docs = (res && res.documents) || [];
    if (!docs.length) break;
    let kept = 0;
    for (const d of docs) {
      const old = d.$createdAt < cutoff;
      if (d.kind === 'story') { await delFile(parse(d.data).fileId); await api('DELETE', `/databases/${DB}/collections/${ACTIONS}/documents/${d.$id}`); acts++; }
      else if (old && drop.has(d.kind)) {
        if (d.kind === 'meta') for (const f of (parse(d.data).files || [])) await delFile(f.id);
        await api('DELETE', `/databases/${DB}/collections/${ACTIONS}/documents/${d.$id}`); acts++;
      } else kept++;
    }
    offset += kept;
  }
}

// 4) کاربرهای تأییدنشده‌ی بیشتر از یک روز و حساب‌های حذف‌شده
for (let offset = 0; ; offset += 100) {
  const res = await api('GET', '/users', [lim(100), off(offset)]);
  const list = (res && res.users) || [];
  if (!list.length) break;
  for (const u of list) {
    if (u.status === false || (!u.emailVerification && u.registration < dayAgo)) { await api('DELETE', `/users/${u.$id}`); users++; offset--; }
  }
  if (list.length < 100) break;
}
console.log(`Deleted: ${posts} posts, ${files} files, ${msgs} messages, ${acts} actions, ${users} users.`);
