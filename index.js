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
const { sendTextSticker: sendBratSticker } = require('./commands/brat');
const { downloadMsgBuffer } = require('./utils/baileysBuffer');

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

// ===== progress bar helper (■ □) =====
// - kirim pesan dengan bar 0%
// - .to(%) -> geser target; bar akan nyusul pelan (smooth)
// - .stop(text) -> set 100% & final label
function formatBar(pct, width = 10) {
  const filled = Math.round((pct / 100) * width);
  const empty = Math.max(0, width - filled);
  return `【${'■'.repeat(filled)}${'□'.repeat(empty)}】 ${String(Math.round(pct)).padStart(3, ' ')}%`;
}
async function startProgressBar(sock, jid, label = 'Memproses…') {
  let current = 0;
  let target = 0;
  let stopped = false;

  const sent = await sock.sendMessage(jid, { text: `${label}\n${formatBar(0)}` });
  const key = sent.key;

  // animator: tiap 700ms geser current mendekati target (step kecil biar halus)
  const timer = setInterval(async () => {
    if (stopped) return;
    if (current < target) {
      const diff = target - current;
      const step = Math.min(5, Math.max(1, diff / 6)); // step adaptif
      current = Math.min(100, current + step);
      try { await sock.sendMessage(jid, { text: `${label}\n${formatBar(current)}`, edit: key }); } catch {}
    }
  }, 700);

  async function to(pct, newLabel) {
    target = Math.max(0, Math.min(100, pct));
    if (newLabel) {
      label = newLabel;
      try { await sock.sendMessage(jid, { text: `${label}\n${formatBar(current)}`, edit: key }); } catch {}
    }
  }
  async function stop(finalText = '✅ Selesai') {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    current = 100; target = 100;
    try { await sock.sendMessage(jid, { text: `${finalText}\n${formatBar(100)}`, edit: key }); }
    catch { await sock.sendMessage(jid, { text: `${finalText}\n${formatBar(100)}` }); }
  }
  return { to, stop, key };
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

    // Menu & Info (tanpa progress)
    if (text === '.menu' || text === '.help') return sendMenu(sock, sender);
    if (text === '.info') return sendInfo(sock, sender);

    // TikTok
    if (text.startsWith('.tiktok ')) {
      const url = text.replace('.tiktok ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Mengunduh TikTok…');
      try {
        await bar.to(10, 'Mengunduh TikTok…');
        if (url.includes('/photo/')) {
          await bar.to(30, 'Mode foto TikTok…');
          await downloadPhoto(sock, sender, url, 'tiktok');
        } else {
          await bar.to(35, 'Ambil metadata…');
          await downloadMedia(sock, sender, url, 'tiktok');
        }
        await bar.stop('✅ TikTok terkirim.');
      } catch (e) {
        console.error('TT error:', e?.message || e);
        await bar.stop('⚠️ Gagal mengunduh TikTok.');
      } finally { stopTyping(); }
      return;
    }

    // Instagram
    if (text.startsWith('.ig ')) {
      const url = text.replace('.ig ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Mengunduh Instagram…');
      try {
        await bar.to(10);
        if (url.includes('/p/') || url.includes('/reel/')) {
          await bar.to(35, 'Ambil metadata…');
          await downloadMedia(sock, sender, url, 'instagram');
        } else {
          await bar.to(30, 'Mode foto…');
          await downloadPhoto(sock, sender, url, 'instagram');
        }
        await bar.stop('✅ Instagram terkirim.');
      } catch (e) {
        console.error('IG error:', e?.message || e);
        await bar.stop('⚠️ Gagal mengunduh Instagram.');
      } finally { stopTyping(); }
      return;
    }

    // YouTube
    if (text.startsWith('.yt ')) {
      const url = text.replace('.yt ', '').trim();
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Mengunduh YouTube…');
      try {
        await bar.to(20, 'Ambil metadata…');
        await downloadMedia(sock, sender, url, 'youtube');
        await bar.stop('✅ YouTube terkirim.');
      } catch (e) {
        console.error('YT error:', e?.message || e);
        await bar.stop('⚠️ Gagal mengunduh YouTube.');
      } finally { stopTyping(); }
      return;
    }

    // Stiker brat teks
    if (text.startsWith('.brat ')) {
      const stickerText = text.replace('.brat ', '').trim();
      if (!stickerText) return sock.sendMessage(sender, { text: '❌ Harap masukkan teks untuk stiker!' });
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Membuat stiker brat…');
      try {
        await bar.to(40, 'Render teks…');
        await sendBratSticker(sock, sender, stickerText);
        await bar.stop('✅ Stiker brat terkirim.');
      } catch (e) {
        console.error('BRAT error:', e?.message || e);
        await bar.stop('⚠️ Gagal membuat stiker brat.');
      } finally { stopTyping(); }
      return;
    }

    // Brat Video
    if (text.startsWith('.bratvideo ')) {
      const vt = text.replace('.bratvideo ', '').trim();
      if (!vt) return sock.sendMessage(sender, { text: '❌ Format: .bratvideo <teks>' });
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Membuat brat video…');
      try {
        await bar.to(35, 'Render video…');
        await makeBratVideo(sock, sender, vt);
        await bar.stop('✅ Video brat terkirim.');
      } catch (e) {
        console.error('bratvideo fail:', e?.message || e);
        await bar.stop('⚠️ Gagal membuat brat video. Pastikan ffmpeg terpasang.');
      } finally { stopTyping(); }
      return;
    }

    // Auto stiker dari gambar
    if (msg.message.imageMessage) {
      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, 'Mengonversi gambar ke stiker…');
      try {
        await bar.to(50, 'Resize & convert…');
        await createStickerBaileys(sock, sender, msg);
        await bar.stop('✅ Stiker terkirim.');
      } catch (e) {
        console.error('sticker error:', e?.message || e);
        await bar.stop('⚠️ Gagal membuat stiker.');
      } finally { stopTyping(); }
      return;
    }

    // Pinterest
    if (text.startsWith('.pin ')) {
      const raw = text.replace('.pin ', '').trim();
      let count = 3; let query = raw;
      const maybeNum = raw.split(' ').pop();
      if (/^\d+$/.test(maybeNum)) { count = Math.min(Math.max(parseInt(maybeNum, 10), 1), 10); query = raw.replace(/\s+\d+$/, '').trim(); }
      if (!query) return sock.sendMessage(sender, { text: '❌ Format: .pin <kata kunci> [jumlah]\ncontoh: .pin hiu 3' });

      const stopTyping = startTyping(sock, sender);
      const bar = await startProgressBar(sock, sender, `Cari Pinterest: ${query}…`);
      try {
        await bar.to(20, 'Cari via DuckDuckGo…');
        await sendPinterestImages(sock, sender, query, count, async (stage, i, total) => {
          if (stage === 'search-bing') await bar.to(30, 'DuckDuckGo gagal, fallback Bing…');
          if (stage === 'download') {
            // 30 → 95% selama unduh
            const pct = 30 + Math.round((i / total) * 65);
            await bar.to(pct, `Unduh gambar ${i}/${total}…`);
          }
        });
        await bar.stop(`✅ Selesai kirim ${query}.`);
      } catch (e) {
        console.error('PIN error:', e?.message || e);
        await bar.stop(`⚠️ Gagal ambil gambar untuk ${query}.`);
      } finally { stopTyping(); }
      return;
    }

    // Command custom
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

    // Auto-response fallback
    const autoResponse = await responseHandler(text);
    if (autoResponse) await sock.sendMessage(sender, { text: autoResponse });
  });
}

if (text.trim() === '.sticker') {
  // kalau pesan ini ada image → pakai langsung
  if (msg.message.imageMessage) {
    const stop = startTyping(sock, sender);
    const bar  = await startProgressBar(sock, sender, 'Mengonversi gambar ke stiker…');
    try {
      await bar.to(60, 'Resize & convert…');
      await createStickerBaileys(sock, sender, msg);
      await bar.stop('✅ Stiker terkirim.');
    } catch {
      await bar.stop('⚠️ Gagal membuat stiker.');
    } finally { stop(); }
  } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
    // kalau user mengetik .sticker sambil reply gambar
    const quoted = { message: { imageMessage: msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage } };
    const stop = startTyping(sock, sender);
    const bar  = await startProgressBar(sock, sender, 'Mengonversi gambar (reply) ke stiker…');
    try {
      await bar.to(60, 'Resize & convert…');
      await createStickerBaileys(sock, sender, quoted);
      await bar.stop('✅ Stiker terkirim.');
    } catch {
      await bar.stop('⚠️ Gagal membuat stiker.');
    } finally { stop(); }
  } else {
    await sock.sendMessage(sender, { text: '📌 Kirim gambar dengan caption *.sticker* atau reply gambar lalu ketik *.sticker*' });
  }
  return;
}

// stiker dari gambar (biasa)
async function createStickerBaileys(sock, sender, msg) {
  try {
    const buffer = await downloadMsgBuffer(msg);
    if (!buffer || !buffer.length) {
      console.log('❌ Buffer kosong / unduh gagal.');
      return sock.sendMessage(sender, { text: '⚠️ Gagal mengunduh gambar.' });
    }

    // cek mimetype yang “aman” tetapi jangan terlalu ketat
    const media = msg.message.imageMessage;
    const mime = media?.mimetype || '';
    const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/avif'];
    if (!allowed.some(m => mime.includes(m.split('/')[1]))) {
      // biarkan sharp coba decode — banyak file heic/avif bisa dibaca bila libvips support
      console.log('ℹ️ Mimetype tidak lazim, tetap coba decode:', mime);
    }

    // Convert → WebP 512x512
    const stickerBuffer = await sharp(buffer, { failOn: false })
      .resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
      .webp({ quality: 95 })
      .toBuffer();

    await sock.sendMessage(sender, { sticker: stickerBuffer });
    console.log('✅ Stiker berhasil dibuat.');
  } catch (e) {
    console.error('createStickerBaileys error:', e);
    await sock.sendMessage(sender, { text: '⚠️ Gagal membuat stiker (format tidak didukung atau file rusak).' });
  }
}

startBot();
