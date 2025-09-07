// handlers/commandHandler.js (atau sesuai path kamu)
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ===== Paths =====
const databaseDir = './database';
const stickerDir = path.join(databaseDir, 'sticker');
if (!fs.existsSync(stickerDir)) fs.mkdirSync(stickerDir, { recursive: true });

// ============ Utils ============

// Fallback-friendly translate to Indonesian
async function translateToIndonesian(text) {
  if (!text) return '';
  // 1) LibreTranslate
  try {
    const { data } = await axios.post('https://libretranslate.com/translate', {
      q: text, source: 'auto', target: 'id', format: 'text'
    }, { timeout: 15000 });
    if (data && data.translatedText) return data.translatedText;
  } catch {}

  // 2) Google “unofficial” API
  try {
    const { data } = await axios.get(
      'https://translate.googleapis.com/translate_a/single',
      {
        params: {
          client: 'gtx', sl: 'auto', tl: 'id', dt: 't', q: text
        },
        timeout: 15000
      }
    );
    return data?.[0]?.map(x => x?.[0]).join('') || text;
  } catch {}

  return text; // fallback: balikkan teks asli
}

// Google-style translate (ke bahasa target), dengan fallback
async function translateText(lang, text) {
  if (!lang || !text) return '⚠️ Gunakan format: *.translate [kode bahasa] [teks]*';
  // 1) Libre
  try {
    const { data } = await axios.post('https://libretranslate.com/translate', {
      q: text, source: 'auto', target: lang, format: 'text'
    }, { timeout: 15000 });
    if (data && data.translatedText)
      return `🌍 *Terjemahan*\n\n🗣️ Teks Asli: ${text}\n🔤 Terjemahan: ${data.translatedText}`;
  } catch {}

  // 2) Google
  try {
    const { data } = await axios.get(
      'https://translate.googleapis.com/translate_a/single',
      {
        params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: text },
        timeout: 15000
      }
    );
    const translated = data?.[0]?.map(x => x?.[0]).join('');
    if (translated) return `🌍 *Terjemahan*\n\n🗣️ Teks Asli: ${text}\n🔤 Terjemahan: ${translated}`;
  } catch {}

  return '⚠️ Gagal menerjemahkan teks.';
}

// ============ Commands ============

// Qur'an
async function getQuranVerse(surah, ayat) {
  if (!surah || !ayat) return '⚠️ Gunakan format: *.quran [nama/nomor surah] [nomor ayat]*';
  try {
    // API lebih stabil kalau surah berupa nomor. Kalau nama, coba fetch list & map ke nomor.
    let surahNum = surah;
    if (isNaN(Number(surah))) {
      try {
        const { data } = await axios.get('https://api.alquran.cloud/v1/surah');
        const hit = (data?.data || []).find(s =>
          s.englishName.toLowerCase() === String(surah).toLowerCase() ||
          s.name.toLowerCase() === String(surah).toLowerCase()
        );
        if (hit) surahNum = hit.number;
      } catch {}
    }

    const { data } = await axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayat}/id.indonesian`);
    const ayah = data.data;
    return `📖 *Ayat Al-Qur'an*\n\n${ayah.text}\n\n📚 *${ayah.surah.englishName}* (QS. ${ayah.surah.number}:${ayah.numberInSurah})`;
  } catch {
    return '⚠️ Ayat tidak ditemukan. Pastikan nama/nomor surah dan nomor ayat benar.';
  }
}

// Jadwal sholat
async function getPrayerTimes(city) {
  if (!city) return '⚠️ Gunakan format: *.jadwalsholat [kota]*';
  try {
    const { data } = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
      params: { city, country: 'ID', method: 2 }, timeout: 15000
    });
    const t = data.data.timings;
    return `🕌 *Jadwal Sholat di ${city}*\n\n🕓 Subuh: ${t.Fajr}\n🌞 Dzuhur: ${t.Dhuhr}\n⛅ Ashar: ${t.Asr}\n🌇 Maghrib: ${t.Maghrib}\n🌙 Isya: ${t.Isha}`;
  } catch {
    return '⚠️ Gagal mengambil jadwal sholat. Pastikan nama kota benar.';
  }
}

// Wiki
async function getWiki(query) {
  if (!query) return '⚠️ Gunakan format: *.wiki [query]*';
  try {
    const { data } = await axios.get(
      `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { timeout: 15000 }
    );
    return `📚 *Wikipedia*\n\n📌 ${data.title}\n\n${data.extract}`;
  } catch {
    return '⚠️ Artikel tidak ditemukan.';
  }
}

// Quote
async function getQuote() {
  try {
    const { data } = await axios.get('https://api.jagokata.com/v3/quotes/random?lang=id', { timeout: 15000 });
    if (data?.quote && data?.author) {
      return `📜 *Kutipan Inspiratif*\n\n_"${data.quote}"_\n— ${data.author}`;
    }
    throw new Error('bad shape');
  } catch (e) {
    return '⚠️ Gagal mengambil kutipan.';
  }
}

// Fakta
const facts = require('../json/facts.json');
async function getRandomFact() {
  try {
    const idx = Math.floor(Math.random() * facts.length);
    return `🤔 *Fakta Menarik*\n\n${facts[idx]}`;
  } catch {
    return '⚠️ Gagal mengambil fakta.';
  }
}

// Pantun
const pantuns = require('../json/pantuns.json');
async function getRandomPantun() {
  try {
    const idx = Math.floor(Math.random() * pantuns.length);
    return `🎤 *Pantun Acak*\n\n${pantuns[idx]}`;
  } catch {
    return '⚠️ Gagal mengambil pantun.';
  }
}

// Meme
async function getRandomMeme() {
  try {
    const { data } = await axios.get('https://meme-api.com/gimme', { timeout: 15000 });
    if (data?.url) return `😂 *Meme Acak*\n\n${data.title}\n${data.url}`;
    throw new Error('no url');
  } catch {
    return '⚠️ Gagal mengambil meme.';
  }
}

// Currency
async function getCurrencyExchange(fromCurrency, toCurrency) {
  if (!fromCurrency || !toCurrency) return '⚠️ Gunakan format: *.currency [mata uang asal] [mata uang tujuan]*';
  try {
    const { data } = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`, { timeout: 15000 });
    const rate = data.rates?.[toCurrency];
    if (!rate) return `⚠️ Mata uang ${toCurrency} tidak ditemukan.`;
    return `💵 *Nilai Tukar*\n\n1 ${fromCurrency.toUpperCase()} = ${rate} ${toCurrency.toUpperCase()}`;
  } catch {
    return '⚠️ Gagal mengambil nilai tukar mata uang.';
  }
}

async function getExchangeRate(fromCurrency, toCurrency, amount) {
  if (!fromCurrency || !toCurrency || isNaN(Number(amount))) {
    return '⚠️ Gunakan format: *.convertcurrency [asal] [tujuan] [jumlah]*';
  }
  try {
    const { data } = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`, { timeout: 15000 });
    const rate = data.rates?.[toCurrency];
    if (!rate) return `⚠️ Mata uang ${toCurrency} tidak ditemukan.`;
    return `💰 ${amount} ${fromCurrency.toUpperCase()} = ${(Number(amount) * rate).toFixed(2)} ${toCurrency.toUpperCase()}`;
  } catch {
    return '⚠️ Gagal mengambil nilai tukar.';
  }
}

// IP Location
async function getIpLocation(ip) {
  if (!ip) return '⚠️ Gunakan format: *.iplocation [ip]*';
  try {
    const { data } = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 15000 });
    if (data?.status !== 'success') throw new Error('bad');
    return `📍 Lokasi IP ${ip}:\n${data.city}, ${data.regionName}, ${data.country}\n📮 ${data.zip}\n📌 ${data.lat}, ${data.lon}\n🕒 ${data.timezone}\n🌐 ${data.isp}`;
  } catch {
    return '⚠️ Gagal mengambil lokasi IP.';
  }
}

// Math (sandbox ringan)
async function evaluateMath(expression) {
  if (!expression) return '⚠️ Gunakan format: *.math [ekspresi]*';
  try {
    // sandbox minimal
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expression});`)();
    return `🧮 Hasil: ${result}`;
  } catch {
    return '⚠️ Ekspresi matematika tidak valid.';
  }
}

// Business idea
async function getBusinessIdea() {
  try {
    const ideas = ['Dropshipping', 'Affiliate Marketing', 'Kursus Online', 'Desain Grafis', 'Penjualan NFT'];
    return `💡 Ide Bisnis: ${ideas[Math.floor(Math.random() * ideas.length)]}`;
  } catch {
    return '⚠️ Gagal mengambil ide bisnis.';
  }
}

// Anime
async function searchAnime(query) {
  if (!query) return '⚠️ Gunakan format: *.anime [nama anime]*';
  try {
    const { data } = await axios.get('https://api.jikan.moe/v4/anime', {
      params: { q: query, limit: 1 }, timeout: 20000
    });
    const anime = data?.data?.[0];
    if (!anime) throw new Error('not found');
    return `🎬 *Informasi Anime*\n\n📅 Tayang: ${anime.aired?.string || '-'}\n🎥 Jenis: ${anime.type || '-'}\n⭐ Rating: ${anime.score ?? '-'}\n📖 Deskripsi: ${anime.synopsis || '-'}\n🔗 Link: ${anime.url}`;
  } catch {
    return '⚠️ Anime tidak ditemukan.';
  }
}

// Manga + translate synopsis ke Indonesia
async function searchManga(query) {
  if (!query) return '⚠️ Gunakan format: *.manga [nama manga]*';
  try {
    const { data } = await axios.get('https://api.jikan.moe/v4/manga', {
      params: { q: query, limit: 1 }, timeout: 20000
    });
    const manga = data?.data?.[0];
    if (!manga) throw new Error('not found');

    const translated = await translateToIndonesian(manga.synopsis || '');
    return `📚 *Informasi Manga*\n\n📅 Terbit: ${manga.published?.string || '-'}\n📄 Jenis: ${manga.type || '-'}\n⭐ Rating: ${manga.score ?? '-'}\n📖 Deskripsi: ${translated || '-'}\n🔗 Link: ${manga.url}`;
  } catch {
    return '⚠️ Manga tidak ditemukan.';
  }
}

// Brainly (scrape ringan)
async function searchBrainly(query) {
  if (!query) return '⚠️ Gunakan format: *.brainly [pertanyaan]*';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(`https://brainly.co.id/app/ask?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    // tunggu elemen; jangan error kalau ga ada
    await page.waitForSelector('.sg-text.sg-text--large', { timeout: 6000 }).catch(() => {});
    await page.waitForSelector('.sg-text.sg-text--break-words', { timeout: 6000 }).catch(() => {});

    const result = await page.evaluate(() => {
      const q = document.querySelector('.sg-text.sg-text--large')?.innerText || 'Pertanyaan tidak ditemukan';
      const a = document.querySelector('.sg-text.sg-text--break-words')?.innerText || 'Jawaban tidak tersedia';
      return { question: q, answer: a };
    });

    return `🧠 *Jawaban Brainly*\n\n📌 *Pertanyaan*: ${result.question}\n💡 *Jawaban*: ${result.answer}`;
  } catch (e) {
    return '⚠️ Gagal mengambil jawaban dari Brainly.';
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

// QR Code → buffer image
async function generateqrcode(text) {
  if (!text) return '⚠️ Gunakan format: *.qr [teks]*';
  try {
    const filePath = path.join(databaseDir, 'qrcode.png');
    await require('qrcode').toFile(filePath, text);
    const fileBuffer = fs.readFileSync(filePath);
    try { fs.unlinkSync(filePath); } catch {}
    return { image: fileBuffer, caption: '✅ QR Code berhasil dibuat!' };
  } catch {
    return '⚠️ Gagal membuat QR Code.';
  }
}

// ============ Dispatcher ============

module.exports = async (command, args) => {
  switch ((command || '').toLowerCase()) {
    case 'quran':            return await getQuranVerse(args[0], args[1]);
    case 'jadwalsholat':     return await getPrayerTimes(args.join(' '));
    case 'wiki':             return await getWiki(args.join(' '));
    case 'translate':        return await translateText(args[0], args.slice(1).join(' '));
    case 'quote':            return await getQuote();
    case 'fact':             return await getRandomFact();
    case 'pantun':           return await getRandomPantun();
    case 'currency':         return await getCurrencyExchange(args[0], args[1]);
    case 'meme':             return await getRandomMeme();
    case 'iplocation':       return await getIpLocation(args[0]);
    case 'convertcurrency':  return await getExchangeRate(args[0], args[1], args[2]);
    case 'math':             return await evaluateMath(args.join(' '));
    case 'businessidea':     return await getBusinessIdea();
    case 'anime':            return await searchAnime(args.join(' '));
    case 'manga':            return await searchManga(args.join(' '));
    case 'brainly':          return await searchBrainly(args.join(' '));
    case 'qr':               return await generateqrcode(args.join(' '));
    default:                 return null;
  }
};
