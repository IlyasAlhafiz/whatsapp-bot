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
const { sendTextSticker: sendBratSticker } = require('./commands/brat'); // stiker brat teks

// ===== presence helper (typing) =====
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

// ===== spinner helper (pesan beranimasi ◐◓◑◒ sampai stop) =====
async function startSpinner(sock, jid, label = 'Loading…') {
  const frames = ['◐','◓','◑','◒'];
  let fi = 0;
  let currentLabel = label;
  let stopped = false;

  const sent = await sock.sendMessage(jid, { text: `${frames[fi]} ${currentLabel}` });
  const key = sent.key;

  // update frame setiap 900ms (aman biar gak ke-rate limit)
  const timer = setInterval(async () => {
    if (stopped) return;
    fi = (fi + 1) % frames.length;
    try {
      await sock.sendMessage(jid, { text: `${frames[fi]} ${currentLabel}`, edit: key });
    } catch {
      // kalau edit gagal (mis. pesan kedaluwarsa), kirim pesan baru & ganti key
      try {
        const s2 = await sock.sendMessage(jid, { text: `${frames[fi]} ${currentLabel}` });
        key.id = s2.key.id;
      } catch {}
    }
  }, 900);

  async function set(text) {
    currentLabel = text || currentLabel;
    try { await sock.sendMessage(jid, { text: `${frames[fi]} ${currentLabel}`, edit: key }); } catch {}
  }

  async function stop(finalText) {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try { await sock.sendMessage(jid, { text: finalText || '✅ Selesai', edit: key }); }
    catch { await sock.sendMessage(jid, { text: finalText || '✅ Selesai' }); }
  }

  return { set, stop, key };
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

    // ===== Menu & Info (cepat, tak perlu spinner) =====
    if (text === '.menu' || text === '.help') return sendMenu(sock, sender);
    if (text === '.info') return sendInfo(sock, sender);

    // ===== TikTok =====
    if (text.startsWith('.tiktok ')) {
      const url = text.replace('.tiktok ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Mengunduh TikTok…');
      try {
        if (url.includes('/photo/')) {
          await spin.set('Mode foto TikTok…');
          await downloadPhoto(sock, sender, url, 'tiktok');
        } else {
          await spin.set('Ambil metadata…');
          await downloadMedia(sock, sender, url, 'tiktok');
        }
        await spin.stop('✅ TikTok terkirim.');
      } catch (e) {
        console.error('TT error:', e?.message || e);
        await spin.stop('⚠️ Gagal mengunduh TikTok.');
      } finally { stopTyping(); }
      return;
    }

    // ===== Instagram =====
    if (text.startsWith('.ig ')) {
      const url = text.replace('.ig ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Mengunduh Instagram…');
      try {
        if (url.includes('/p/') || url.includes('/reel/')) {
          await spin.set('Ambil metadata…');
          await downloadMedia(sock, sender, url, 'instagram');
        } else {
          await spin.set('Mode foto…');
          await downloadPhoto(sock, sender, url, 'instagram');
        }
        await spin.stop('✅ Instagram terkirim.');
      } catch (e) {
        console.error('IG error:', e?.message || e);
        await spin.stop('⚠️ Gagal mengunduh Instagram.');
      } finally { stopTyping(); }
      return;
    }

    // ===== YouTube =====
    if (text.startsWith('.yt ')) {
      const url = text.replace('.yt ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Mengunduh YouTube…');
      try {
        await spin.set('Ambil metadata…');
        await downloadMedia(sock, sender, url, 'youtube');
        await spin.stop('✅ YouTube terkirim.');
      } catch (e) {
        console.error('YT error:', e?.message || e);
        await spin.stop('⚠️ Gagal mengunduh YouTube.');
      } finally { stopTyping(); }
      return;
    }

    // ===== Stiker brat teks =====
    if (text.startsWith('.brat ')) {
      const stickerText = text.replace('.brat ', '').trim();
      if (!stickerText) return sock.sendMessage(sender, { text: '❌ Harap masukkan teks untuk stiker!' });
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Membuat stiker brat…');
      try {
        await spin.set('Render teks…');
        await sendBratSticker(sock, sender, stickerText);
        await spin.stop('✅ Stiker brat terkirim.');
      } catch (e) {
        console.error('BRAT error:', e?.message || e);
        await spin.stop('⚠️ Gagal membuat stiker brat.');
      } finally { stopTyping(); }
      return;
    }

    // ===== Brat Video =====
    if (text.startsWith('.bratvideo ')) {
      const vt = text.replace('.bratvideo ', '').trim();
      if (!vt) return sock.sendMessage(sender, { text: '❌ Format: .bratvideo <teks>' });
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Membuat brat video…');
      try {
        await spin.set('Render video…');
        await makeBratVideo(sock, sender, vt);
        await spin.stop('✅ Video brat terkirim.');
      } catch (e) {
        console.error('bratvideo fail:', e?.message || e);
        await spin.stop('⚠️ Gagal membuat brat video. Pastikan ffmpeg terpasang.');
      } finally { stopTyping(); }
      return;
    }

    // ===== Auto stiker dari gambar =====
    if (msg.message.imageMessage) {
      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, 'Mengonversi gambar ke stiker…');
      try {
        await spin.set('Resize & convert…');
        await createStickerBaileys(sock, sender, msg);
        await spin.stop('✅ Stiker terkirim.');
      } catch (e) {
        console.error('sticker error:', e?.message || e);
        await spin.stop('⚠️ Gagal membuat stiker.');
      } finally { stopTyping(); }
      return;
    }

    // ===== Pinterest =====
    if (text.startsWith('.pin ')) {
      const raw = text.replace('.pin ', '').trim();
      let count = 3; let query = raw;
      const maybeNum = raw.split(' ').pop();
      if (/^\d+$/.test(maybeNum)) { count = Math.min(Math.max(parseInt(maybeNum, 10), 1), 10); query = raw.replace(/\s+\d+$/, '').trim(); }
      if (!query) return sock.sendMessage(sender, { text: '❌ Format: .pin <kata kunci> [jumlah]\ncontoh: .pin hiu 3' });

      const stopTyping = startTyping(sock, sender);
      const spin = await startSpinner(sock, sender, `Cari Pinterest: ${query}…`);
      try {
        await spin.set('Cari via DuckDuckGo…');
        await sendPinterestImages(sock, sender, query, count, async (stage, i, total) => {
          if (stage === 'search-bing') await spin.set('DuckDuckGo gagal, fallback Bing…');
          if (stage === 'download') await spin.set(`Unduh gambar ${i}/${total}…`);
        });
        await spin.stop(`✅ Selesai kirim ${query}.`);
      } catch (e) {
        console.error('PIN error:', e?.message || e);
        await spin.stop(`⚠️ Gagal ambil gambar untuk ${query}.`);
      } finally { stopTyping(); }
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

// stiker dari gambar (biasa)
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
