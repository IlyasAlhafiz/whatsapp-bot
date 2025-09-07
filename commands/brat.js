// commands/brat.js
const sharp = require('sharp');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ukur lebar teks dengan render SVG mini (akurat di sharp)
async function measureWidth(fontSize, text, fontFamily = 'Arial') {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg">
       <text x="0" y="${fontSize}" font-size="${fontSize}" font-family="${fontFamily}">${esc(text)}</text>
     </svg>`
  );
  const meta = await sharp(svg).metadata();
  // fallback kira-kira kalau meta.width undefined
  return meta.width || Math.ceil(text.length * fontSize * 0.6);
}

// bagi kata panjang kalau 1 kata melebihi contentWidth
async function hardBreakWord(word, fontSize, contentWidth, fontFamily) {
  const res = [];
  // estimasi maxChar per baris pakai lebar karakter "M"
  const mWidth = await measureWidth(fontSize, 'M', fontFamily);
  const maxChars = Math.max(1, Math.floor(contentWidth / mWidth));
  for (let i = 0; i < word.length; i += maxChars) {
    res.push(word.slice(i, i + maxChars));
  }
  return res;
}

// bungkus baris sesuai width
async function wrapLines(text, fontSize, contentWidth, fontFamily) {
  const words = text.trim().replace(/\s+/g, ' ').split(' ');
  const lines = [];
  let line = '';

  for (let w of words) {
    // jika kata terlalu panjang, pecah dulu
    let parts = [w];
    const wWidth = await measureWidth(fontSize, w, fontFamily);
    if (wWidth > contentWidth) parts = await hardBreakWord(w, fontSize, contentWidth, fontFamily);

    for (const part of parts) {
      const test = line ? `${line} ${part}` : part;
      const width = await measureWidth(fontSize, test, fontFamily);
      if (width <= contentWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = part;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildBratStickerBuffer(text) {
  const W = 512, H = 512;
  const PAD = 36;               // padding kiri/kanan/atas/bawah
  const LH = 1.15;              // line-height
  const FONT = 'Arial';         // di Windows ada; boleh ganti ke font lain yg terpasang
  const contentW = W - PAD * 2;
  const contentH = H - PAD * 2;

  let fontSize = 170;           // start besar, nanti diperkecil
  const minFS = 20;

  let lines = [];
  for (; fontSize >= minFS; fontSize -= 6) {
    lines = await wrapLines(text, fontSize, contentW, FONT);
    const totalH = lines.length * fontSize * LH;
    if (totalH <= contentH) break; // muat, selesai
  }
  // kalau masih belum muat banget, paksa ukuran minimum
  if (fontSize < minFS) fontSize = minFS;

  // posisi awal Y (supaya nggak nempel banget ke atas)
  const startY = PAD + fontSize * 0.9;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <rect width="100%" height="100%" fill="white"/>
       <g font-family="${FONT}" font-size="${fontSize}" fill="black">
         ${lines.map((ln, i) =>
           `<text x="${PAD}" y="${startY + i * fontSize * LH}" text-anchor="start">${esc(ln)}</text>`
         ).join('')}
       </g>
     </svg>`;

  // render ke webp 512x512
  return sharp(Buffer.from(svg))
    .webp({ quality: 100 })
    .toBuffer();
}

async function sendTextSticker(sock, sender, text) {
  try {
    if (!text || !text.trim()) {
      return sock.sendMessage(sender, { text: '❌ Harap masukkan teks untuk stiker!' });
    }
    const buf = await buildBratStickerBuffer(text);
    await sock.sendMessage(sender, { sticker: buf });
  } catch (e) {
    console.error('brat sticker error:', e);
    await sock.sendMessage(sender, { text: '⚠️ Gagal membuat stiker brat.' });
  }
}

module.exports = { sendTextSticker };
