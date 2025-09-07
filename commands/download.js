const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const { generateUniqueFileName } = require('../helpers/fileutils');
const { getTikTokPhotoUrls } = require('../helpers/tiktokScraper');
const { tiktokDir, igDir, ytDir } = require('../config');

function getYtDlpPath() {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) return process.env.YT_DLP_PATH;
  const isWin = process.platform === 'win32';
  const localBin = path.join(__dirname, '..', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp';
}
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function ytDlpJSON(url) {
  const cmd = getYtDlpPath();
  const args = ['-j', '--no-warnings', '--no-playlist', url];
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    const p = spawn(cmd, args, { shell: false });
    p.stdout.on('data', d => (out += d.toString()));
    p.stderr.on('data', d => (err += d.toString()));
    p.on('error', e => reject(e));
    p.on('close', code => {
      if (code === 0) { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('Gagal parse metadata: ' + e.message)); } }
      else reject(new Error(err || `yt-dlp exited ${code}`));
    });
  });
}
function ytDlpDownload(url, outPath) {
  const cmd = getYtDlpPath();
  const args = ['-o', outPath, '--no-playlist', '--no-warnings', '-S', 'res,ext:mp4:m4a', url];
  return new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(cmd, args, { shell: false });
    p.stderr.on('data', d => (err += d.toString()));
    p.on('error', e => reject(e));
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err || `yt-dlp exited ${code}`))));
  });
}

const downloadMedia = async (sock, sender, url) => {
  let platform;
  if (/tiktok\.com/i.test(url)) platform = 'tiktok';
  else if (/instagram\.com/i.test(url)) platform = 'ig';
  else if (/youtube\.com|youtu\.be/i.test(url)) platform = 'youtube';
  else { await sock.sendMessage(sender, { text: '⚠️ Platform tidak dikenali.' }); return; }

  const directories = { tiktok: tiktokDir, ig: igDir, youtube: ytDir };
  const mediaDir = directories[platform];
  ensureDir(mediaDir);

  const unique = generateUniqueFileName();

  // TikTok Photo Mode
  if (platform === 'tiktok' && url.includes('/photo/')) {
    try {
      const photoUrls = await getTikTokPhotoUrls(url);
      if (!photoUrls?.length) { await sock.sendMessage(sender, { text: '⚠️ Gagal mengambil foto dari TikTok!' }); return; }
      for (let i = 0; i < photoUrls.length; i++) {
        const photoUrl = photoUrls[i];
        const photoPath = path.join(mediaDir, `${unique}_${i}.jpg`);
        try {
          const res = await axios.get(photoUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(photoPath, res.data);
          await sock.sendMessage(sender, { image: fs.readFileSync(photoPath) });
        } catch (e) { console.error(`⚠️ Foto ${i + 1} gagal:`, e?.message || e); }
        finally { try { fs.unlinkSync(photoPath); } catch {} }
      }
      return;
    } catch (e) { console.error('TT photo error:', e?.message || e); await sock.sendMessage(sender, { text: '⚠️ Gagal mengambil foto TikTok.' }); return; }
  }

  // Metadata + unduh
  let meta;
  try { meta = await ytDlpJSON(url); }
  catch (e) {
    if ((e.message || '').toLowerCase().includes('not recognized') || (e.message || '').toLowerCase().includes('spawn yt-dlp')) {
      await sock.sendMessage(sender, { text:
`❌ *yt-dlp tidak ditemukan.*
• Taruh biner di: *./bin/yt-dlp.exe* (Windows) atau set env *YT_DLP_PATH*
• Atau tambahkan yt-dlp ke PATH lalu restart terminal.` });
      return;
    }
    console.error('❌ Error metadata:', e.message || e);
    await sock.sendMessage(sender, { text: '⚠️ Gagal mendapatkan metadata media.' });
    return;
  }

  const title = meta.title || `${platform.toUpperCase()} media`;
  const desc  = meta.description || '';
  const isVideo = (meta.ext || '').toLowerCase() === 'mp4' || meta.is_live === false || meta.duration;
  const outPath = path.join(mediaDir, `${unique}.${isVideo ? 'mp4' : 'jpg'}`);

  try { await ytDlpDownload(url, outPath); }
  catch (e) { console.error(`❌ Error unduh ${platform}:`, e.message || e); await sock.sendMessage(sender, { text: `⚠️ Gagal mengunduh media dari ${platform}!` }); return; }

  try {
    if (isVideo) await sock.sendMessage(sender, { video: fs.readFileSync(outPath) });
    else await sock.sendMessage(sender, { image: fs.readFileSync(outPath) });
    await sock.sendMessage(sender, { text: `*${title}*\n\n${desc || ' '}` });
  } finally { try { fs.unlinkSync(outPath); } catch {} }
};

module.exports = { downloadMedia, downloadPhoto: async () => {} }; // downloadPhoto kamu sendiri kalau ada
