function getUptime() {
  const s = Math.floor(process.uptime());
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
async function sendInfo(sock, sender) {
  const text = `🤖 *Bot Info*\n\n✅ Status: Aktif\n⏳ Uptime: ${getUptime()}`;
  await sock.sendMessage(sender, { text });
}
module.exports = { sendInfo };