async function sendMenu(sock, sender) {
  const menuText = `╭════•›「 *Menu Bot* 」
├≽️ *.menu* / *.help* — Lihat menu
├≽️ *.info* — Info bot
├≽️ *.tiktok [url]* — Unduh TikTok
├≽️ *.ig [url]* — Unduh Instagram
├≽️ *.yt [url]* — Unduh YouTube
├≽️ *.brat [teks]* — Stiker teks
├≽️ *.bratvideo [teks]* — Video teks
├≽️ *.pin <query> [jumlah]* — Gambar Pinterest
╰═══════════════`;
  await sock.sendMessage(sender, { text: menuText });
}
module.exports = { sendMenu };
