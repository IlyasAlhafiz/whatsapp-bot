const axios = require('axios');
const cheerio = require('cheerio');
const axiosRetry = require('axios-retry').default;
const { HttpsProxyAgent } = require('https-proxy-agent');

// Optional proxy
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

// Axios instance + retry
const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
  httpsAgent,
});
axiosRetry(http, {
  retries: 3,
  retryDelay: (count) => 500 * count,
  retryCondition: (err) => axiosRetry.isNetworkError(err) || axiosRetry.isRetryableError(err),
});

// DuckDuckGo
async function getVQD(query) {
  const res = await http.get('https://duckduckgo.com/', { params: { q: query } });
  const m = res.data && res.data.match(/vqd='([^']+)'/);
  if (!m) throw new Error('vqd not found');
  return m[1];
}
async function ddgImageSearchPinimg(query, max = 3) {
  const vqd = await getVQD(query);
  const out = [];
  let next = { vqd, q: query, o: 'json', l: 'us-en', s: 0 };
  while (out.length < max && next) {
    const res = await http.get('https://duckduckgo.com/i.js', {
      params: next, headers: { Referer: 'https://duckduckgo.com/' },
    });
    const results = (res.data.results || []).filter(r => (r.image || '').includes('pinimg.com'));
    for (const r of results) {
      if (out.length >= max) break;
      out.push({ url: r.image, title: r.title || query, source: r.source || r.url || '' });
    }
    if (out.length < max && res.data.next) {
      const qs = res.data.next.split('?')[1] || '';
      next = Object.fromEntries(new URLSearchParams(qs));
    } else next = null;
  }
  return out;
}

// Bing fallback
async function bingImageSearchPinimg(query, max = 3) {
  const url = 'https://www.bing.com/images/search';
  const params = { q: `site:pinimg.com ${query}`, form: 'IQFRML', first: 1, tsc: 'ImageBasicHover' };
  const res = await http.get(url, { params, headers: { Referer: 'https://www.bing.com/' } });
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
        const title = ($(el).attr('aria-label') || query).trim();
        out.push({ url: img, title, source: 'bing' });
      }
    } catch {}
  });
  return out;
}

async function searchPinimg(query, count) {
  try {
    const a = await ddgImageSearchPinimg(query, count);
    if (a.length) return a;
  } catch (e) { console.warn('DDG error:', e.message || e); }
  return bingImageSearchPinimg(query, count);
}

async function sendPinterestImages(sock, sender, query, count = 3, onProgress) {
  const noop = async () => {};
  onProgress = onProgress || noop;

  try {
    await onProgress('search-ddg');
    let results = await searchPinimg(query, count);
    if (!results || !results.length) {
      await sock.sendMessage(sender, { text: `❌ Tidak menemukan gambar Pinterest untuk: ${query}` });
      return;
    }
    const total = Math.min(results.length, count);
    for (let i = 0; i < total; i++) {
      await onProgress('download', i + 1, total);
      try {
        const imgRes = await http.get(results[i].url, { responseType: 'arraybuffer' });
        await sock.sendMessage(sender, {
          image: Buffer.from(imgRes.data),
          caption: `🖼 Pinterest: ${results[i].title}\n(${i + 1}/${total})`,
        });
        await new Promise(r => setTimeout(r, 600)); // throttle
      } catch (e) {
        console.warn('Download image fail:', e.message || e);
      }
    }
  } catch (e) {
    await onProgress('search-bing');
    throw e;
  }
}

module.exports = { sendPinterestImages };