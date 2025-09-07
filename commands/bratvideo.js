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

// Escape untuk drawtext
function escTextForDrawtext(s) {
  return String(s)
    .replace(/\\/g, '\\\\')   // backslash -> \\
    .replace(/:/g, '\\:')     // colon -> \:
    .replace(/'/g, "\\'");    // single quote -> \'
}
// Path font: ubah backslash ke forward slash + escape colon
function escFontPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Cari font yang ada di sistem (atau pakai font proyek)
function findFont() {
  const candidates = [
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/ARIAL.TTF',
    path.join(__dirname, '..', 'assets', 'NotoSans-Regular.ttf'), // kalau kamu taruh font sendiri di ./assets/
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

async function makeBratVideo(sock, sender, text) {
  const outDir = path.join(__dirname, '..', 'temp');
  ensureDir(outDir);
  const outPath = path.join(outDir, `brat_${Date.now()}.mp4`);

  const fontPath = findFont(); // bisa null
  const safeText = escTextForDrawtext(text);
  const drawOpts = [];

  if (fontPath) {
    drawOpts.push(`fontfile='${escFontPath(fontPath)}'`);
  } else {
    // fallback: beri nama font (tidak selalu berhasil di Windows, tapi dicoba)
    drawOpts.push(`font='Arial'`);
  }

  drawOpts.push(
    `text='${safeText}'`,
    `x=(w/2-tw/2)+80*sin(t*2)`,
    `y=(h/2-th/2)`,
    `fontsize=64`,
    `fontcolor=white`,
    `shadowx=2`,
    `shadowy=2`
  );

  const draw = `drawtext=${drawOpts.join(':')}`;

  const cmd = getFfmpegPath();
  const args = [
    '-hide_banner',
    '-f','lavfi','-i','color=c=#111111:s=720x720:r=30',
    '-t','3',
    '-vf', draw,
    '-c:v','libx264','-preset','ultrafast','-crf','23',
    '-pix_fmt','yuv420p',
    outPath
  ];

  await new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(cmd, args, { shell: false });
    p.stderr.on('data', d => err += d.toString());
    p.on('error', e => reject(e));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || `ffmpeg exited ${code}`)));
  });

  await sock.sendMessage(sender, { video: fs.readFileSync(outPath), caption: '🎬 Brat Video' });
  try { fs.unlinkSync(outPath); } catch {}
}

module.exports = { makeBratVideo };
