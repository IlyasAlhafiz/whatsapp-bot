// commands/pinterest.js
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

// HTTP client: timeout & UA stabil
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  },
});

// ===== utils =====
function shuffle(arr) {
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function normalizePinimg(url) {
  try {
    const u = new URL(url);
    // buang query biar de-dup lebih akurat
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}
function uniqueBy(arr, fn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = fn(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

// ===== DuckDuckGo image API (butuh vqd), khusus pinimg =====
async function getVQD(query) {
  const res = await http.get('https://duckduckgo.com/', { params: { q: query } });
  const m = String(res.data).match(/vqd='([^']+)'/);
  if (!m) throw new Error('vqd not found');
  return m[1];
}

/**
 * Ambil banyak hasil pinimg dari DDG. Kita ambil "more than needed"
 * lalu nanti di-shuffle agar berbeda tiap kali.
 */
async function ddgImageSearchPinimg(query, want = 20) {
  const vqd = await getVQD(query);

  // random start offset supaya hasil beda-beda
  let s = Math.floor(Math.random() * 60); // 0..59
  const results = [];
  let next = { vqd, q: query, o: 'json', l: 'us-en', s };

  while (results.length < want && next) {
    const res = await http.get('https://duckduckgo.com/i.js', {
      params: next,
      headers: { Referer: 'https://duckduckgo.com/' },
    });

    const arr = (res.data.results || []).filter((r) =>
      (r.image || '').includes('pinimg.com')
    );

    for (const r of arr) {
      results.push({
        url: normalizePinimg(r.image),
        title: r.title || query,
        source: 'ddg',
      });
      if (results.length >= want) break;
    }

    if (res.data.next && results.length < want) {
      // parse query-string next
      const qs = res.data.next.split('?')[1] || '';
      next = Object.fromEntries(new URLSearchParams(qs));
    } else {
      next = null;
    }
  }

  return results;
}

// ===== Bing fallback (pinimg) =====
async function bingImageSearchPinimg(query, want = 20) {
  const url = 'https://www.bing.com/images/search';
  const res = await http.get(url, { params: { q: `site:pinimg.com ${query}` } });
  const $ = cheerio.load(res.data);
  const out = [];
  $('a.iusc').each((_, el) => {
    try {
      const m = $(el).attr('m');
      if (!m) return;
      const data = JSON.parse(m);
      const img = data.murl || data.murlHttps || data.turl;
      if (img && img.includes('pinimg.com')) {
        out.push({
          url: normalizePinimg(img),
          title: ($(el).attr('aria-label') || query).trim(),
          source: 'bing',
        });
      }
    } catch {}
  });
  // ambil lebih banyak, nanti dipotong di caller
  return out.slice(0, want);
}

async function searchPinimg(query, want) {
  // Coba DDG dulu, ambil banyak (min 30) untuk variasi
  const need = Math.max(want * 3, 30);
  try {
    let a = await ddgImageSearchPinimg(query, need);
    a = uniqueBy(a, (x) => x.url);
    if (a.length) return shuffle(a);
  } catch (e) {
    // biar index.js bisa nunjukin "fallback Bing"
    throw Object.assign(new Error('DDG fail'), { code: 'DDG_FAIL' });
  }
  return [];
}

/**
 * Kirim hasil pinimg ke user dengan variasi (acak).
 * onProgress(stage, i, total)
 *  - stage: 'search-ddg' | 'search-bing' | 'download'
 */
async function sendPinterestImages(sock, sender, query, count = 3, onProgress) {
  const noop = async () => {};
  onProgress = onProgress || noop;

  // 1) Coba DDG
  await onProgress('search-ddg');
  let results = [];
  try {
    results = await searchPinimg(query, count);
  } catch (e) {
    // 2) Fallback ke Bing
    await onProgress('search-bing');
    try {
      results = await bingImageSearchPinimg(query, Math.max(count * 4, 24));
      results = uniqueBy(results, (x) => x.url);
      results = shuffle(results);
    } catch (err) {
      console.warn('Bing fail:', err?.message || err);
    }
  }

  if (!results || results.length === 0) {
    await sock.sendMessage(sender, { text: `❌ Tidak menemukan gambar Pinterest untuk: *${query}*` });
    return;
  }

  // 3) Ambil acak sesuai count
  results = shuffle(results).slice(0, Math.max(1, count));

  const total = results.length;
  for (let i = 0; i < total; i++) {
    await onProgress('download', i + 1, total);
    const url = results[i].url;

    try {
      // kecil kemungkinan CDN kasih gambar yang sama → tambahkan "cache buster"
      const bust = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}_${crypto.randomInt(1e6)}`;
      const imgRes = await http.get(bust, { responseType: 'arraybuffer' });

      await sock.sendMessage(sender, {
        image: Buffer.from(imgRes.data),
        caption: `🖼 Pinterest: ${results[i].title}\n(${i + 1}/${total})`,
      });

      // jeda kecil supaya tidak dianggap spam
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      console.warn('IMG fail:', e?.message || e);
    }
  }
}

module.exports = { sendPinterestImages };
