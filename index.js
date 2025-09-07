const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const sharp = require('sharp');

const { sendMenu } = require('./commands/menu');
const { sendInfo } = require('./commands/info');
const { downloadMedia, downloadPhoto } = require('./commands/download');
const commandHandler = require('./handlers/commandHandler'); // pakai punyamu
const responseHandler = require('./handlers/response');
const { sendPinterestImages } = require('./commands/pinterest');
const { makeBratVideo } = require('./commands/bratvideo');
import { sendTextSticker } from './commands/brat.js';

// ===== Simple progress (edit pesan) =====
function startTyping(sock, jid) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { await sock.sendPresenceUpdate('composing', jid); } catch {}
    if (!stopped) setTimeout(tick, 6000);
  };
  tick();
  return () => { stopped = true; sock.sendPresenceUpdate('paused', jid).catch(()=>{}); };
}
async function startProgressMessage(sock, jid, initial = '⏳ Sedang diproses…') {
  const sent = await sock.sendMessage(jid, { text: initial });
  const key = sent.key;
  async function update(text) {
    try { await sock.sendMessage(jid, { text, edit: key }); return true; }
    catch { await sock.sendMessage(jid, { text }); return false; }
  }
  return { update, key };
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') console.log('✅ Bot berhasil terhubung!');
    if (connection === 'close') startBot();
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages?.[0];
    if (!msg?.message || !msg?.key?.remoteJid) return;
    if (msg.key.fromMe) return;     // anti-echo
    if (type !== 'notify') return;  // hanya pesan baru

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!text) return;
    console.log(`💬 Pesan dari ${sender}: ${text}`);

    // ===== Menu & Info =====
    if (text === '.menu' || text === '.help') return sendMenu(sock, sender);
    if (text === '.info') return sendInfo(sock, sender);

    // ===== TikTok =====
    if (text.startsWith('.tiktok ')) {
      const url = text.replace('.tiktok ', '').trim();
      if (url.includes('/photo/')) return downloadPhoto(sock, sender, url, 'tiktok');

      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Mengunduh dari TikTok…');
      try { await downloadMedia(sock, sender, url, 'tiktok'); await prog.update('✅ TikTok terkirim.'); }
      catch { await prog.update('⚠️ Gagal mengunduh TikTok.'); }
      finally { stop(); }
      return;
    }

    // ===== Instagram =====
    if (text.startsWith('.ig ')) {
      const url = text.replace('.ig ', '').trim();
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Mengunduh dari Instagram…');
      try {
        if (url.includes('/p/') || url.includes('/reel/')) await downloadMedia(sock, sender, url, 'instagram');
        else await downloadPhoto(sock, sender, url, 'instagram');
        await prog.update('✅ Instagram terkirim.');
      } catch { await prog.update('⚠️ Gagal mengunduh Instagram.'); }
      finally { stop(); }
      return;
    }

    // ===== YouTube =====
    if (text.startsWith('.yt ')) {
      const url = text.replace('.yt ', '').trim();
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Mengunduh dari YouTube…');
      try { await downloadMedia(sock, sender, url, 'youtube'); await prog.update('✅ YouTube terkirim.'); }
      catch { await prog.update('⚠️ Gagal mengunduh YouTube.'); }
      finally { stop(); }
      return;
    }

    // ===== Stiker teks (.brat <teks>) =====
    if (text.startsWith('.brat ')) {
    const stickerText = text.replace('.brat ', '').trim();
    if (!stickerText) return sock.sendMessage(sender, { text: '❌ Harap masukkan teks untuk stiker!' });
    // progress milikmu sendiri tetap boleh dipakai
    await sendTextSticker(sock, sender, stickerText);
    return;
    }

    // ===== Brat Video (.bratvideo <teks>) =====
    if (text.startsWith('.bratvideo ')) {
      const vt = text.replace('.bratvideo ', '').trim();
      if (!vt) return sock.sendMessage(sender, { text: '❌ Format: .bratvideo <teks>' });
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Membuat brat video…');
      try { await makeBratVideo(sock, sender, vt); await prog.update('✅ Video terkirim.'); }
      catch (e) { console.error('bratvideo fail:', e?.message || e); await prog.update('⚠️ Gagal membuat brat video. Pastikan ffmpeg ada.'); }
      finally { stop(); }
      return;
    }

    // ===== Jika ada gambar → auto stiker =====
    if (msg.message.imageMessage) {
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Mengonversi gambar ke stiker…');
      try { await createStickerBaileys(sock, sender, msg); await prog.update('✅ Stiker terkirim.'); }
      catch { await prog.update('⚠️ Gagal membuat stiker.'); }
      finally { stop(); }
      return;
    }

    // ===== Pinterest (.pin <query> [jumlah]) =====
    if (text.startsWith('.pin ')) {
      const raw = text.replace('.pin ', '').trim();
      let count = 3; let query = raw;
      const maybeNum = raw.split(' ').pop();
      if (/^\d+$/.test(maybeNum)) { count = Math.min(Math.max(parseInt(maybeNum, 10), 1), 10); query = raw.replace(/\s+\d+$/, '').trim(); }
      if (!query) return sock.sendMessage(sender, { text: '❌ Format: .pin <kata kunci> [jumlah]\ncontoh: .pin aesthetic car 5' });

      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, `🔎 Mencari gambar Pinterest untuk: *${query}* (0%)`);
      try {
        await prog.update(`🛰️ Cari via DuckDuckGo… (20%)`);
        await sendPinterestImages(sock, sender, query, count, async (stage, i, total) => {
          if (stage === 'search-bing') await prog.update('🛰️ DDG gagal, fallback Bing… (30%)');
          if (stage === 'download') await prog.update(`⬇️ Unduh gambar ${i}/${total}… (${30 + Math.min(60, Math.round((i/total)*60))}%)`);
        });
        await prog.update(`✅ Selesai kirim hasil *${query}*. (100%)`);
      } catch { await prog.update(`⚠️ Gagal mengambil gambar untuk *${query}*.`); }
      finally { stop(); }
      return;
    }

    // ===== Command custom (diawali titik) =====
    if (text.trim().startsWith('.')) {
      const args = text.slice(1).split(' ');
      const command = (args.shift() || '').toLowerCase();
      const response = await commandHandler(command, args);
      if (response) {
        if (typeof response === 'object' && (response.image || response.video || response.sticker)) {
          await sock.sendMessage(sender, response);
        } else {
          await sock.sendMessage(sender, { text: String(response) });
        }
      }
      return;
    }

    // ===== Auto-response fallback =====
    const autoResponse = await responseHandler(text);
    if (autoResponse) await sock.sendMessage(sender, { text: autoResponse });
  });
}

// Stiker teks
async function sendTextSticker(sock, sender, text) {
  const width = 512, height = 512, outputPath = 'sticker.webp';
  const svgImage = `
  <svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="50%" y="50%" font-size="60" text-anchor="middle" fill="black" dy=".3em">${text}</text>
  </svg>`;
  fs.writeFileSync('text.svg', svgImage);

  await sharp('text.svg').resize(width, height).toFormat('webp').toFile(outputPath);
  fs.unlinkSync('text.svg');

  await sock.sendMessage(sender, { sticker: fs.readFileSync(outputPath) });
  fs.unlinkSync(outputPath);
}

// Stiker dari gambar
async function createStickerBaileys(sock, sender, msg) {
  const buffer = await sock.downloadMediaMessage(msg);
  if (!buffer) {
    console.log('❌ Gagal mengunduh gambar.');
    return sock.sendMessage(sender, { text: '⚠️ Gagal mengunduh gambar.' });
  }
  const media = msg.message.imageMessage;
  if (!media || !['image/jpeg', 'image/png', 'image/webp'].includes(media.mimetype)) {
    console.log('❌ Gambar bukan format yang valid.');
    return sock.sendMessage(sender, { text: 'Mohon kirimkan gambar dalam format JPG, PNG, atau WEBP!' });
  }
  const stickerBuffer = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFormat('webp').toBuffer();

  await sock.sendMessage(sender, { sticker: stickerBuffer });
}
startBot();
