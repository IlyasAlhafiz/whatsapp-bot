const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const isWin = process.platform === 'win32';
  const local = path.join(__dirname, '..', 'bin', isWin ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(local)) return local;
  return 'ffmpeg';
}
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ----- util escape drawtext -----
function escTextForDrawtext(s) {
  // dukung newline untuk multi-line
  return String(s)
    .replace(/\\/g, '\\\\')   // \  -> \\
    .replace(/:/g, '\\:')     // :  -> \:
    .replace(/'/g, "\\'")     // '  -> \'
    .replace(/\n/g, '\\n');   // newline
}
function escFontPath(p) { return p.replace(/\\/g, '/').replace(/:/g, '\\:'); }

// ----- pilih font -----
function findFont() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'Roboto-Regular.ttf'), // kalau kamu punya
    'C:/Windows/Fonts/Roboto-Regular.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/roboto/Roboto-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

// ----- wrapping sederhana: jaga agar tiap baris <= maxChars -----
function wrapText(text, maxChars) {
  const words = String(text).trim().replace(/\s+/g, ' ').split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length <= maxChars) line = test;
    else { if (line) lines.push(line); line = w.length > maxChars ? w : w; }
    // kalau satu kata sangat panjang, potong keras
    while (line.length > maxChars) {
      lines.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

async function makeBratVideo(sock, sender, rawText) {
  const outDir = path.join(__dirname, '..', 'temp');
  ensureDir(outDir);

  // 512x512, durasi & fps
  const SIZE = '512x512';
  const FPS  = 20;
  const DURATION = 2.8; // detik

  // hitung panjang baris → tentukan font-size
  const maxChars = 13;                            // target per baris
  const wrapped = wrapText(rawText, maxChars);    // ubah jadi multi-line dengan \n
  const lines = wrapped.split('\n');
  const longest = Math.max(...lines.map(l => l.length), 1);
  // font adaptif: makin panjang, makin kecil
  let fontSize = Math.max(28, Math.min(112, Math.floor(460 / Math.max(longest, 6))));
  // kalau baris banyak, kecilkan lagi
  if (lines.length >= 4) fontSize = Math.max(24, Math.floor(fontSize * 0.9));
  if (lines.length >= 6) fontSize = Math.max(22, Math.floor(fontSize * 0.85));

  // spacing antar baris (px)
  const lineSpacing = Math.round(fontSize * 0.08);  // rapat, mirip brat
  const leftPad = 26;                                // padding kiri
  const topPad  = 26 + Math.round(fontSize * 0.7);   // start Y sedikit turun

  const safeText = escTextForDrawtext(wrapped);
  const fontPath = findFont();

  // bangun filter drawtext (animasi X sinus kecil)
  const drawOpts = [];
  if (fontPath) drawOpts.push(`fontfile='${escFontPath(fontPath)}'`);
  else          drawOpts.push(`font='Arial'`);

  drawOpts.push(
    `text='${safeText}'`,
    // geser kiri-kanan 10px dengan kecepatan sedang
    `x=${leftPad}+10*sin(2*PI*t*0.8)`,
    `y=${topPad}`,
    `fontsize=${fontSize}`,
    `fontcolor=black`,
    `line_spacing=${lineSpacing}`,
    `enable='between(t,0,${DURATION})'`
  );
  const draw = `drawtext=${drawOpts.join(':')}`;

  // output WEBP animasi (stiker)
  const outWebp = path.join(outDir, `brat_${Date.now()}.webp`);

  const cmd = getFfmpegPath();
  const args = [
    '-hide_banner',
    // sumber kanvas putih
    '-f', 'lavfi', '-r', String(FPS), '-i', `color=c=white:s=${SIZE}`,
    // filter: gambar + teks
    '-t', String(DURATION),
    '-vf', draw,
    // webp anim
    '-an', '-vsync', '0',
    '-vcodec', 'libwebp',
    '-lossless', '0',
    '-q:v', '70',          // kualitas (50–80 makin kecil makin tajam)
    '-preset', 'default',
    '-loop', '0',          // 0 = loop selamanya
    outWebp
  ];

  await new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(cmd, args, { shell: false });
    p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `ffmpeg exited ${code}`)));
  });

  // kirim sebagai stiker animasi
  await sock.sendMessage(sender, { sticker: fs.readFileSync(outWebp) });

  try { fs.unlinkSync(outWebp); } catch {}
}

module.exports = { makeBratVideo };