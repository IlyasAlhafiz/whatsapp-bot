function getUptime() {
  const totalSec = Math.floor(process.uptime());
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
function buildMenuText() {
  return `╭════•›「 *Menu Bot* 」
├≽️ *.menu* / *.help*
├ _Menampilkan list menu_
├≽️ *.info*
├ _Info Bot_
├≽️ *.tiktok [url]* / *.ig [url]* / *.yt [url]*
├ _Unduh media_
├≽️ *.brat [teks]*
├ _Stiker teks_
├≽️ *.bratvideo [teks]*
├ _Video teks_
├≽️ *.pin <query> [jumlah]*
├ _Gambar dari Pinterest_
╰═══════════════`;
}
const STATIC_RESPONSES = [
  { keys: ['hai','halo','hi','hey'], reply: 'Halo! Ada yang bisa saya bantu? 😊' },
  { keys: ['ping'], reply: 'Pong! 🏓' },
  { keys: ['apa kabar','bagaimana kabarmu','apa kabar kamu'], reply: 'Saya baik, terima kasih! Kamu gimana? 😊' },
  { keys: ['selamat pagi'], reply: 'Selamat pagi! Semoga harimu menyenangkan! ☀️' },
  { keys: ['selamat siang'], reply: 'Selamat siang! Ada yang bisa saya bantu? 🌤️' },
  { keys: ['selamat malam'], reply: 'Selamat malam! Semoga istirahatnya nyenyak! 🌙' },
  { keys: ['terima kasih','terimakasih','makasih'], reply: 'Sama-sama! 😊' },
  { keys: ['sama-sama'], reply: 'Senang bisa membantu! 🙌' },
  { keys: ['siapa kamu','kamu siapa','bot'], reply: 'Saya bot asisten kamu. Ketik *.menu* buat lihat fitur. 🤖' },
  { keys: ['bisa bikin stiker','buatkan stiker','stiker'], reply: 'Tentu! Kirim gambarnya ya, nanti kubuatin stiker. 🧩' },
  { keys: ['download video','cari video'], reply: 'Kirim linknya ya. Aku support TikTok/IG/YouTube. 🎬' },
  { keys: ['translate','terjemah','terjemahkan'], reply: 'Tulis teks yang mau diterjemahkan, sertakan bahasa tujuan (mis. *id*, *en*). 🌐' },
  { keys: ['mau main','game'], reply: 'Boleh! Mau tebak-tebakan, kuis, atau pantun? 😄' },
];
function normalize(t){return (t||'').toLowerCase().replace(/\s+/g,' ').trim();}
module.exports = async function responseHandler(text){
  if(!text) return null;
  if(text.trim().startsWith('.')) return null;
  const t = normalize(text);
  if (t==='menu'||t==='.menu'||t==='help'||t==='.help') return buildMenuText();
  if (t==='info'||t==='.info') return `🤖 *Bot Info*\n\n✅ Status: Aktif\n⏳ Uptime: ${getUptime()}`;
  for (const item of STATIC_RESPONSES) if (item.keys.some(k=>t.includes(k))) return item.reply;
  if (t.includes('siapa yang menciptakanmu')) return 'Saya dikembangkan oleh tim pengembang yang niat bantu kamu. 😊';
  return null;
};
