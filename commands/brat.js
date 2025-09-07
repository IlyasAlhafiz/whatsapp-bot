const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { writeFile } = require("fs/promises");

const CANVAS = { width: 512, height: 512 };
const STYLE = {
  // kalau punya font TTF sendiri (mis. Inter-Black.ttf), isi env BRAT_FONT_FILE
  // contoh: set BRAT_FONT_FILE=C:\path\to\Inter-Bold.ttf
  fontFamily: "Arial",
  fontWeight: 800,           // tebal
  initialFont: 140,          // mulai besar
  minFont: 26,               // minimal kalau teks sangat panjang
  step: 4,                   // turunkan per 4px saat fitting
  lineHeight: 1.12,          // rapat biar mirip contoh
  padding: { left: 32, right: 32, top: 24, bottom: 28 },
  textColor: "#111111",
  bg: "#ffffff",             // putih, biar tak transparan
  radius: 0,                 // 0 = full kotak. Mau rounded? set 28
  letterSpacing: 0,          // bisa atur tracking kalau mau
};

function escapeXML(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontCss() {
  // kalau BRAT_FONT_FILE di-set & file ada, sematkan @font-face (agar render konsisten)
  const file = process.env.BRAT_FONT_FILE;
  if (file && fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    const b64 = buf.toString("base64");
    // nama family custom agar tidak bentrok
    return `
      @font-face {
        font-family: 'BratCustom';
        src: url(data:font/ttf;base64,${b64}) format('truetype');
        font-weight: 100 900;
        font-style: normal;
      }
    `;
  }
  return "";
}
function effectiveFamily() {
  return process.env.BRAT_FONT_FILE && fs.existsSync(process.env.BRAT_FONT_FILE)
    ? "BratCustom"
    : STYLE.fontFamily;
}

/** ukur lebar teks aktual dengan SVG kecil */
async function measureTextWidth(text, fontSize, fontFamily, fontWeight, letterSpacing = 0) {
  const tmpSvg = `
  <svg xmlns="http://www.w3.org/2000/svg">
    <style>${fontCss()}</style>
    <text font-size="${fontSize}" font-family="${fontFamily}" font-weight="${fontWeight}"
          letter-spacing="${letterSpacing}">${escapeXML(text)}</text>
  </svg>`;
  const tempPath = path.join(process.cwd(), ".tmp_measure.svg");
  await writeFile(tempPath, tmpSvg);
  try {
    const meta = await sharp(tempPath).metadata();
    return meta.width || 0;
  } finally { try { fs.unlinkSync(tempPath); } catch {} }
}

/** wrap per kata ke baris2 agar <= maxWidth */
async function wrapWordsToLines(words, fontSize, maxWidth) {
  const family = effectiveFamily();
  const lines = [];
  let curr = "";
  for (const w of words) {
    const probe = curr ? `${curr} ${w}` : w;
    const ww = await measureTextWidth(probe, fontSize, family, STYLE.fontWeight, STYLE.letterSpacing);
    if (ww <= maxWidth) {
      curr = probe;
    } else {
      if (curr) lines.push(curr);
      const singleWidth = await measureTextWidth(w, fontSize, family, STYLE.fontWeight, STYLE.letterSpacing);
      if (singleWidth > maxWidth) {
        // kalau sepatah kata lebih lebar, dorong apa adanya (biar nggak mentok loop)
        lines.push(w);
        curr = "";
      } else {
        curr = w;
      }
    }
  }
  if (curr) lines.push(curr);
  return lines;
}

/** cari font terbesar yang muat lebar & tinggi area */
async function fitText(text) {
  const W = CANVAS.width, H = CANVAS.height;
  const maxWidth  = W - (STYLE.padding.left + STYLE.padding.right);
  const maxHeight = H - (STYLE.padding.top + STYLE.padding.bottom);
  const words = String(text).trim().split(/\s+/);

  for (let font = STYLE.initialFont; font >= STYLE.minFont; font -= STYLE.step) {
    const lines = await wrapWordsToLines(words, font, maxWidth);
    const lineHeightPx = font * STYLE.lineHeight;
    const blockHeight = lines.length * lineHeightPx;

    if (blockHeight <= maxHeight) {
      // double-check setiap baris muat lebar
      let ok = true;
      for (const line of lines) {
        const w = await measureTextWidth(line, font, effectiveFamily(), STYLE.fontWeight, STYLE.letterSpacing);
        if (w > maxWidth) { ok = false; break; }
      }
      if (ok) {
        return { fontSize: font, lines, lineHeightPx, blockHeight, maxWidth };
      }
    }
  }
  // fallback
  const font = STYLE.minFont;
  const lines = await wrapWordsToLines(words, font, maxWidth);
  const lineHeightPx = font * STYLE.lineHeight;
  const blockHeight = lines.length * lineHeightPx;
  return { fontSize: font, lines, lineHeightPx, blockHeight, maxWidth };
}

/** render SVG brat: rata kiri, start dari atas (turun ke bawah) */
function renderSVGBratTopLeft(fit) {
  const W = CANVAS.width, H = CANVAS.height;
  const { lines, fontSize, lineHeightPx } = fit;
  const family = effectiveFamily();

  const startY = STYLE.padding.top; // mulai dari atas, bukan tengah

  const textNodes = lines.map((line, i) => {
    const y = Math.round(startY + i * lineHeightPx);
    return `<text x="${STYLE.padding.left}" y="${y}"
      font-size="${fontSize}" font-family="${family}" font-weight="${STYLE.fontWeight}"
      letter-spacing="${STYLE.letterSpacing}"
      fill="${STYLE.textColor}" text-anchor="start" dominant-baseline="hanging">${escapeXML(line)}</text>`;
  }).join("\n");

  const bgRect = STYLE.bg === "transparent"
    ? ""
    : `<rect x="0" y="0" width="100%" height="100%" rx="${STYLE.radius}" ry="${STYLE.radius}" fill="${STYLE.bg}"/>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>${fontCss()}</style>
  ${bgRect}
  ${textNodes}
</svg>`;
}

async function createBratLeftSticker(text, outputPath) {
  const fit = await fitText(text);
  const svg = renderSVGBratTopLeft(fit);
  const tempSvg = path.join(process.cwd(), ".tmp_brat.svg");
  await writeFile(tempSvg, svg);

  let pipe = sharp(tempSvg);
  if (STYLE.bg !== "transparent") {
    pipe = pipe.flatten({ background: STYLE.bg }); // hilangkan alpha
  }
  await pipe.toFormat("webp").toFile(outputPath);
  try { fs.unlinkSync(tempSvg); } catch {}
}

async function sendTextSticker(sock, sender, text) {
  const out = "sticker.webp";
  await createBratLeftSticker(text, out);
  await sock.sendMessage(sender, { sticker: fs.readFileSync(out) });
  try { fs.unlinkSync(out); } catch {}
}

module.exports = { sendTextSticker, createBratLeftSticker };