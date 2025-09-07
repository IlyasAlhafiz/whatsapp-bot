const axios = require('axios');
const fs = require('fs');
const path = require('path');   
const puppeteer = require("puppeteer");
const qrcode = require('qrcode');


const databaseDir = './database';
const stickerDir = path.join(databaseDir, 'sticker');

if (!fs.existsSync(stickerDir)) {
    fs.mkdirSync(stickerDir, { recursive: true });
}

// Fungsi untuk mendapatkan ayat Al-Qur'an berdasarkan surah dan ayat
async function getQuranVerse(surah, ayat) {
    if (!surah || !ayat) return "⚠️ Gunakan format: *.quran [nama surah] [nomor ayat]*";

    try {
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayat}/id.indonesian`);
        const ayah = response.data.data;
        return `📖 *Ayat Al-Qur'an*\n\n${ayah.text}\n\n📚 *${ayah.surah.englishName}* (QS. ${ayah.surah.number}:${ayah.numberInSurah})`;
    } catch (error) {
        return "⚠️ Ayat tidak ditemukan. Pastikan nama surah dan nomor ayat benar.";
    }
}

// Fungsi untuk mendapatkan jadwal sholat
async function getPrayerTimes(city) {
    if (!city) return "⚠️ Gunakan format: *.jadwalsholat [kota]*";

    try {
        const response = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${city}&country=ID&method=2`);
        const data = response.data.data.timings;
        return `🕌 *Jadwal Sholat di ${city}*\n\n🕓 Subuh: ${data.Fajr}\n🌞 Dzuhur: ${data.Dhuhr}\n⛅ Ashar: ${data.Asr}\n🌇 Maghrib: ${data.Maghrib}\n🌙 Isya: ${data.Isha}`;
    } catch (error) {
        return "⚠️ Gagal mengambil jadwal sholat. Pastikan nama kota benar.";
    }
}

// Fungsi untuk mendapatkan ringkasan Wikipedia
async function getWiki(query) {
    if (!query) return "⚠️ Gunakan format: *.wiki [query]*";

    try {
        const response = await axios.get(`https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
        return `📚 *Wikipedia*\n\n📌 ${response.data.title}\n\n${response.data.extract}`;
    } catch (error) {
        return "⚠️ Artikel tidak ditemukan.";
    }
}

// Fungsi untuk menerjemahkan teks
async function translateText(lang, text) {
    if (!lang || !text) return "⚠️ Gunakan format: *.translate [kode bahasa] [teks]*";

    try {
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=id&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
        return `🌍 *Terjemahan*\n\n🗣️ Teks Asli: ${text}\n🔤 Terjemahan: ${response.data[0][0][0]}`;
    } catch (error) {
        return "⚠️ Gagal menerjemahkan teks.";
    }
}

async function translateWithLibreTranslate(text) {
    try {
        const response = await axios.post('https://libretranslate.com/translate', {
            q: text,
            source: 'en',
            target: 'id',
            format: 'text'
        });
        return response.data.translatedText;
    } catch (error) {
        return "⚠️ Gagal menerjemahkan teks.";
    }
}

// Fungsi untuk mengambil kutipan inspiratif dalam bahasa Indonesia
async function getQuote() {
    try {
        const response = await axios.get("https://api.jagokata.com/v3/quotes/random?lang=id");
        if (response.data && response.data.quote && response.data.author) {
            const quote = response.data.quote;
            const author = response.data.author;
            return `📜 *Kutipan Inspiratif*\n\n_"${quote}"_\n— ${author}`;
        } else {
            throw new Error('Response format is unexpected');
        }
    } catch (error) {
        console.error("Error fetching quote:", error);
        return "⚠️ Gagal mengambil kutipan.";
    }
}

// Fungsi untuk mendapatkan fakta acak
const facts = require('../json/facts.json');

async function getRandomFact() {
    try {
        const randomIndex = Math.floor(Math.random() * facts.length);
        return `🤔 *Fakta Menarik*\n\n${facts[randomIndex]}`;
    } catch (error) {
        console.error(error);
        return "⚠️ Gagal mengambil fakta.";
    }
}

// Fungsi untuk mendapatkan meme acak
async function getRandomMeme() {
    try {
        const response = await axios.get("https://meme-api.herokuapp.com/gimme");
        return `😂 *Meme Acak*\n\n${response.data.title}\n${response.data.url}`;
    } catch (error) {
        return "⚠️ Gagal mengambil meme.";
    }
}

// Fungsi untuk mendapatkan pantun acak
const pantuns = require('../json/pantuns.json');

async function getRandomPantun() {
    try {
        const randomIndex = Math.floor(Math.random() * pantuns.length);
        return `🎤 *Pantun Acak*\n\n${pantuns[randomIndex]}`;
    } catch (error) {
        console.error(error);
        return "⚠️ Gagal mengambil pantun.";
    }
}

// Fungsi untuk mendapatkan nilai tukar mata uang
async function getCurrencyExchange(fromCurrency, toCurrency) {
    if (!fromCurrency || !toCurrency) return "⚠️ Gunakan format: *.currency [mata uang asal] [mata uang tujuan]*";

    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        const exchangeRate = response.data.rates[toCurrency];
        if (!exchangeRate) return `⚠️ Mata uang ${toCurrency} tidak ditemukan.`;
        return `💵 *Nilai Tukar*\n\n1 ${fromCurrency.toUpperCase()} = ${exchangeRate} ${toCurrency.toUpperCase()}`;
    } catch (error) {
        return "⚠️ Gagal mengambil nilai tukar mata uang.";
    }
}

async function getIpLocation(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return `📍 Lokasi IP ${ip}: ${response.data.city}, ${response.data.country}, ${response.data.regionName}, ${response.data.zip}, ${response.data.lat}, ${response.data.lon}, ${response.data.timezone}, ${response.data.isp}`;
    } catch (error) {
        return "⚠️ Gagal mengambil lokasi IP.";
    }
}

async function getExchangeRate(fromCurrency, toCurrency, amount) {
    try {
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        const rate = response.data.rates[toCurrency];
        if (!rate) return `⚠️ Mata uang ${toCurrency} tidak ditemukan.`;
        return `💰 ${amount} ${fromCurrency} = ${(amount * rate).toFixed(2)} ${toCurrency}`;
    } catch (error) {
        return "⚠️ Gagal mengambil nilai tukar.";
    }
}

async function evaluateMath(expression) {
    try {
        const result = eval(expression);
        return `🧮 Hasil: ${result}`;
    } catch (error) {
        return "⚠️ Ekspresi matematika tidak valid.";
    }
}

async function getBusinessIdea() {
    try {
        const ideas = ["Dropshipping", "Affiliate Marketing", "Kursus Online", "Desain Grafis", "Penjualan NFT"];
        return `💡 Ide Bisnis: ${ideas[Math.floor(Math.random() * ideas.length)]}`;
    } catch (error) {
        return "⚠️ Gagal mengambil ide bisnis.";
    }
}

// Fungsi untuk mencari informasi anime berdasarkan nama
async function searchAnime(query) {
    if (!query) return "⚠️ Gunakan format: *.anime [nama anime]*";

    try {
        const response = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
        const anime = response.data.data[0];
        
        return `🎬 *Informasi Anime*\n\n📅 Tayang: ${anime.aired.string}\n🎥 Jenis: ${anime.type}\n⭐ Rating: ${anime.score}\n📖 Deskripsi: ${anime.synopsis}\n🔗 Link: ${anime.url}`;
    } catch (error) {
        return "⚠️ Anime tidak ditemukan.";
    }
}

// Fungsi untuk mencari manga dan menerjemahkan deskripsi
async function searchManga(query) {
    if (!query) return "⚠️ Gunakan format: *.manga [nama manga]*";

    try {
        const response = await axios.get(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=1`);
        const manga = response.data.data[0];

        // Menerjemahkan deskripsi manga ke bahasa Indonesia
        const translatedDescription = await translateToIndonesian(manga.synopsis);

        return `📚 *Informasi Manga*\n\n📅 Tayang: ${manga.published.string}\n🎥 Jenis: ${manga.type}\n⭐ Rating: ${manga.score}\n📖 Deskripsi: ${translatedDescription}\n🔗 Link: ${manga.url}`;
    } catch (error) {
        return "⚠️ Manga tidak ditemukan.";
    }
}

async function searchBrainly(query) {
    if (!query) return "⚠️ Gunakan format: *.brainly [pertanyaan]*";

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(`https://brainly.co.id/app/ask?q=${encodeURIComponent(query)}`, {
            waitUntil: "domcontentloaded",
        });

        // Tunggu elemen pertanyaan dan jawaban muncul
        await page.waitForSelector(".sg-text.sg-text--large", { timeout: 5000 }).catch(() => null);
        await page.waitForSelector(".sg-text.sg-text--break-words", { timeout: 5000 }).catch(() => null);

        // Ambil data jawaban
        const result = await page.evaluate(() => {
            const question = document.querySelector(".sg-text.sg-text--large")?.innerText || "Pertanyaan tidak ditemukan";
            const answer = document.querySelector(".sg-text.sg-text--break-words")?.innerText || "Jawaban tidak tersedia";
            return { question, answer };
        });

        await browser.close();

        return `🧠 *Jawaban Brainly*\n\n📌 *Pertanyaan*: ${result.question}\n💡 *Jawaban*: ${result.answer}`;
    } catch (error) {
        console.error(error);
        return "⚠️ Gagal mengambil jawaban dari Brainly.";
    }
}

async function generateqrcode(text) {
    if (!text) return "⚠️ Gunakan format: *.qr [teks]*";

    try {
        const filePath = path.join(databaseDir, 'qrcode.png');
        await require('qrcode').toFile(filePath, text);
        const fileBuffer = fs.readFileSync(filePath);
        fs.unlinkSync(filePath);
        return { image: fileBuffer, caption: "✅ QR Code berhasil dibuat!" };
    } catch (error) {
        console.error(error);
        return "⚠️ Gagal membuat QR Code.";
    }
}


// Module command handler
module.exports = async (command, args) => {
    switch (command) {
        case "quran": return await getQuranVerse(args[0], args[1]);
        case "jadwalsholat": return await getPrayerTimes(args.join(" "));
        case "wiki": return await getWiki(args.join(" "));
        case "translate": return await translateText(args[0], args.slice(1).join(" "));
        case "quote": return await getQuote();
        case "fact": return await getRandomFact();
        case "pantun": return await getRandomPantun();
        case "currency": return await getCurrencyExchange(args[0], args[1]);
        case "meme": return await getRandomMeme();
        case "iplocation": return await getIpLocation(args[0]);
        case "convertcurrency": return await getExchangeRate(args[0], args[1], args[2]);
        case "math": return await evaluateMath(args.join(" "));
        case "businessidea": return await getBusinessIdea();
        case "anime": return await searchAnime(args.join(" "));
        case "manga": return await searchManga(args.join(" "));
        case "brainly": return await searchBrainly(args.join(" "));
        case "qr": return await generateqrcode(args.join(" "));
    }
};
