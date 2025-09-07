const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const sharp = require('sharp');

const { sendMenu } = require('./commands/menu');
const { sendInfo } = require('./commands/info');
const { downloadMedia, downloadPhoto } = require('./commands/download');
const commandHandler = require('./handlers/commandHandler');
const responseHandler = require('./handlers/response');
const { sendPinterestImages } = require('./commands/pinterest');
const { makeBratVideo } = require('./commands/bratvideo');
const { sendTextSticker: sendBratSticker } = require('./commands/brat'); // brat teks ala kiri

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
    if (msg.key.fromMe) return;
    if (type !== 'notify') return;

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

    // ===== Stiker brat teks (.brat <teks>) =====
    if (text.startsWith('.brat ')) {
      const stickerText = text.replace('.brat ', '').trim();
      if (!stickerText) return sock.sendMessage(sender, { text: '❌ Harap masukkan teks untuk stiker!' });
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Membuat stiker brat…');
      try { await sendBratSticker(sock, sender, stickerText); await prog.update('✅ Stiker brat terkirim.'); }
      catch { await prog.update('⚠️ Gagal membuat stiker brat.'); }
      finally { stop(); }
      return;
    }

    // ===== Brat Video =====
    if (text.startsWith('.bratvideo ')) {
      const vt = text.replace('.bratvideo ', '').trim();
      if (!vt) return sock.sendMessage(sender, { text: '❌ Format: .bratvideo <teks>' });
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Membuat brat video…');
      try { await makeBratVideo(sock, sender, vt); await prog.update('✅ Video brat terkirim.'); }
      catch (e) { console.error('bratvideo fail:', e?.message || e); await prog.update('⚠️ Gagal membuat brat video.'); }
      finally { stop(); }
      return;
    }

    // ===== Auto stiker dari gambar =====
    if (msg.message.imageMessage) {
      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, '⏳ Mengonversi gambar ke stiker…');
      try { await createStickerBaileys(sock, sender, msg); await prog.update('✅ Stiker terkirim.'); }
      catch { await prog.update('⚠️ Gagal membuat stiker.'); }
      finally { stop(); }
      return;
    }

    // ===== Pinterest =====
    if (text.startsWith('.pin ')) {
      const raw = text.replace('.pin ', '').trim();
      let count = 3; let query = raw;
      const maybeNum = raw.split(' ').pop();
      if (/^\d+$/.test(maybeNum)) { count = Math.min(Math.max(parseInt(maybeNum, 10), 1), 10); query = raw.replace(/\s+\d+$/, '').trim(); }
      if (!query) return sock.sendMessage(sender, { text: '❌ Format: .pin <kata kunci> [jumlah]' });

      const stop = startTyping(sock, sender);
      const prog = await startProgressMessage(sock, sender, `🔎 Cari Pinterest: *${query}*`);
      try {
        await sendPinterestImages(sock, sender, query, count, async (stage, i, total) => {
          if (stage === 'search-bing') await prog.update('🛰️ DDG gagal, fallback Bing…');
          if (stage === 'download') await prog.update(`⬇️ Unduh gambar ${i}/${total}…`);
        });
        await prog.update(`✅ Selesai kirim *${query}*.`);
      } catch { await prog.update(`⚠️ Gagal ambil gambar untuk *${query}*.`); }
      finally { stop(); }
      return;
    }

    // ===== Command custom =====
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

// Stiker dari gambar (biasa)
async function createStickerBaileys(sock, sender, msg) {
  const buffer = await sock.downloadMediaMessage(msg);
  if (!buffer) return sock.sendMessage(sender, { text: '⚠️ Gagal unduh gambar.' });
  const media = msg.message.imageMessage;
  if (!media || !['image/jpeg','image/png','image/webp'].includes(media.mimetype)) {
    return sock.sendMessage(sender, { text: 'Kirim gambar JPG/PNG/WEBP ya!' });
  }
  const stickerBuffer = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .toFormat('webp').toBuffer();
  await sock.sendMessage(sender, { sticker: stickerBuffer });
}

startBot();
