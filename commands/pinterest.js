// commands/pinterest.js
const axios = require('axios');
const cheerio = require('cheerio');

// timeout & UA biar stabil
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  }
});

// --- DuckDuckGo image API (butuh vqd dari page)
async function getVQD(query) {
  const res = await http.get('https://duckduckgo.com/', { params: { q: query } });
  const m = String(res.data).match(/vqd='([^']+)'/);
  if (!m) throw new Error('vqd not found');
  return m[1];
}

async function ddgImageSearchPinimg(query, max = 3) {
  const vqd = await getVQD(query);
  const results = [];
  let next = { vqd, q: query, o: 'json', l: 'us-en', s: 0 };
  while (results.length < max && next) {
    const res = await http.get('https://duckduckgo.com/i.js', { params: next, headers: { Referer: 'https://duckduckgo.com/' } });
    const arr = (res.data.results || []).filter(r => (r.image || '').includes('pinimg.com'));
    for (const r of arr) {
      if (results.length >= max) break;
      results.push({ url: r.image, title: r.title || query, source: 'ddg' });
    }
    if (res.data.next && results.length < max) {
      const qs = res.data.next.split('?')[1] || '';
      next = Object.fromEntries(new URLSearchParams(qs));
    } else {
      next = null;
    }
  }
  return results;
}

// --- Bing fallback
async function bingImageSearchPinimg(query, max = 3) {
  const url = 'https://www.bing.com/images/search';
  const res = await http.get(url, { params: { q: `site:pinimg.com ${query}` } });
  const $ = cheerio.load(res.data);
  const out = [];
  $('a.iusc').each((_, el) => {
    if (out.length >= max) return;
    try {
      const m = $(el).attr('m');
      if (!m) return;
      const data = JSON.parse(m);
      const img = data.murl || data.murlHttps || data.turl;
      if (img && img.includes('pinimg.com')) {
        out.push({ url: img, title: ($(el).attr('aria-label') || query).trim(), source: 'bing' });
      }
    } catch {}
  });
  return out;
}

async function searchPinimg(query, count) {
  try {
    const a = await ddgImageSearchPinimg(query, count);
    if (a.length) return a;
  } catch (e) {
    console.warn('DDG fail:', e?.message || e);
  }
  return bingImageSearchPinimg(query, count);
}

/**
 * Kirim hasil pinimg ke user.
 * onProgress(stage, i, total)
 *  - stage: 'search-ddg' | 'search-bing' | 'download'
 */
async function sendPinterestImages(sock, sender, query, count = 3, onProgress) {
  const noop = async () => {};
  onProgress = onProgress || noop;

  await onProgress('search-ddg');
  const results = await searchPinimg(query, count);
  if (!results || results.length === 0) {
    await sock.sendMessage(sender, { text: `❌ Tidak menemukan gambar Pinterest untuk: *${query}*` });
    return;
  }

  const total = Math.min(results.length, count);
  for (let i = 0; i < total; i++) {
    await onProgress('download', i + 1, total);
    try {
      const imgRes = await http.get(results[i].url, { responseType: 'arraybuffer' });
      await sock.sendMessage(sender, {
        image: Buffer.from(imgRes.data),
        caption: `🖼 Pinterest: ${results[i].title}\n(${i + 1}/${total})`
      });
      // jeda dikit biar ga spam
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.warn('IMG fail:', e?.message || e);
    }
  }
}

module.exports = { sendPinterestImages };
