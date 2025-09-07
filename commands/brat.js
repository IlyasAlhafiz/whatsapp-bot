// bratLeftSticker.js  (ESM)
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { writeFile } from "fs/promises";

const CANVAS = { width: 512, height: 512 };
const STYLE = {
  fontFamily: "Arial",       // ganti dengan font lain kalau mau
  initialFont: 96,           // mulai coba dari 96px
  minFont: 28,               // minimal 28px
  step: 4,                   // turunin ukuran per 4px saat fitting
  lineHeight: 1.2,           // 120% line-height
  padding: { left: 36, right: 24, top: 32, bottom: 32 },
  textColor: "#000000",
  shadowColor: "#00000055",  // bayangan tipis
  shadowOffset: { x: 1.5, y: 1.5 },
  bg: "transparent",         // "transparent" atau warna mis. "#ffffff"
};

/** bikin SVG kecil buat ukur lebar teks aktual dengan font tertentu */
async function measureTextWidth(text, fontSize, fontFamily) {
  const tmpSvg = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <text font-size="${fontSize}" font-family="${fontFamily}" font-weight="700">${escapeXML(
    text
  )}</text>
    </svg>`;
  const tempPath = path.join(process.cwd(), ".tmp_measure.svg");
  await writeFile(tempPath, tmpSvg);
  try {
    const meta = await sharp(tempPath).metadata();
    return meta.width || 0;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

function escapeXML(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** bungkus kata menjadi array baris yang tidak melebihi maxWidth (ukur aktual) */
async function wrapWordsToLines(words, fontSize, fontFamily, maxWidth) {
  const lines = [];
  let curr = "";
  for (const w of words) {
    const probe = curr ? `${curr} ${w}` : w;
    const ww = await measureTextWidth(probe, fontSize, fontFamily);
    if (ww <= maxWidth) {
      curr = probe;
    } else {
      if (curr) lines.push(curr);
      // kalau 1 kata lebih lebar dari maxWidth, tetap dorong sebagai line sendiri
      // supaya tidak infinite loop — biarkan overflow sedikit
      const singleWidth = await measureTextWidth(w, fontSize, fontFamily);
      if (singleWidth > maxWidth) {
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

/** cari font terbesar yang muat (lebar & tinggi) di area teks */
async function fitText(text, cfg) {
  const W = CANVAS.width;
  const H = CANVAS.height;
  const maxWidth = W - (cfg.padding.left + cfg.padding.right);
  const maxHeight = H - (cfg.padding.top + cfg.padding.bottom);
  const words = String(text).trim().split(/\s+/);

  for (let font = cfg.initialFont; font >= cfg.minFont; font -= cfg.step) {
    const lines = await wrapWordsToLines(words, font, cfg.fontFamily, maxWidth);
    const lineHeightPx = font * cfg.lineHeight;
    const blockHeight = lines.length * lineHeightPx;

    // cek tinggi
    if (blockHeight <= maxHeight) {
      // cek lebar tiap baris (harus <= maxWidth)
      let ok = true;
      for (const line of lines) {
        const w = await measureTextWidth(line, font, cfg.fontFamily);
        if (w > maxWidth) { ok = false; break; }
      }
      if (ok) {
        return { fontSize: font, lines, lineHeightPx, blockHeight, maxWidth };
      }
    }
  }
  // fallback bila sangat panjang
  const font = cfg.minFont;
  const lines = await wrapWordsToLines(words, font, cfg.fontFamily, maxWidth);
  const lineHeightPx = font * cfg.lineHeight;
  const blockHeight = lines.length * lineHeightPx;
  return { fontSize: font, lines, lineHeightPx, blockHeight, maxWidth };
}

/** render SVG brat-left */
function renderSVGBratLeft(fit, cfg) {
  const W = CANVAS.width;
  const H = CANVAS.height;
  const { lines, fontSize, lineHeightPx, blockHeight } = fit;

  // posisi blok vertikal: tengah
  const startY = cfg.padding.top + (H - cfg.padding.top - cfg.padding.bottom - blockHeight) / 2;

  // dua layer: shadow + text (biar kebaca)
  const textNodesShadow = lines.map((line, i) => {
    const y = Math.round(startY + i * lineHeightPx);
    return `<text x="${cfg.padding.left + cfg.shadowOffset.x}" y="${y + cfg.shadowOffset.y}"
      font-size="${fontSize}" font-family="${cfg.fontFamily}" font-weight="700"
      fill="${cfg.shadowColor}" text-anchor="start" dominant-baseline="hanging">${escapeXML(line)}</text>`;
  }).join("\n");

  const textNodes = lines.map((line, i) => {
    const y = Math.round(startY + i * lineHeightPx);
    return `<text x="${cfg.padding.left}" y="${y}"
      font-size="${fontSize}" font-family="${cfg.fontFamily}" font-weight="700"
      fill="${cfg.textColor}" text-anchor="start" dominant-baseline="hanging">${escapeXML(line)}</text>`;
  }).join("\n");

  const bgRect = cfg.bg === "transparent"
    ? ""
    : `<rect width="100%" height="100%" fill="${cfg.bg}"/>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${bgRect}
  ${textNodesShadow}
  ${textNodes}
</svg>`;
}

export async function createBratLeftSticker(text, outputPath) {
  const cfg = STYLE;
  const fit = await fitText(text, cfg);
  const svg = renderSVGBratLeft(fit, cfg);

  const tempSvg = path.join(process.cwd(), ".tmp_brat.svg");
  await writeFile(tempSvg, svg);

  await sharp(tempSvg)
    .toFormat("webp")
    .toFile(outputPath);

  try { fs.unlinkSync(tempSvg); } catch {}
}

/** kirim stiker (pakai di index.js) */
export async function sendTextSticker(sock, sender, text) {
  const out = "sticker.webp";
  await createBratLeftSticker(text, out);
  await sock.sendMessage(sender, { sticker: fs.readFileSync(out) });
  try { fs.unlinkSync(out); } catch {}
}
