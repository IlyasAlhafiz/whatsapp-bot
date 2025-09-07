// utils/progress.js
const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function buildBar(pct, width = 12) {
  const filled = Math.round((pct / 100) * width);
  const empty = Math.max(0, width - filled);
  return `▰`.repeat(filled) + `▱`.repeat(empty);
}

function fmtHMS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = String(Math.floor(s / 3600)).padStart(2,'0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2,'0');
  const ss= String(s % 60).padStart(2,'0');
  return `${h}:${m}:${ss}`;
}

/**
 * ProgressManager per JID
 * - edit pesan secara berkala (debounce)
 * - indikator typing
 * - dukung .cancel
 */
class Progress {
  constructor(sock, jid, taskLabel = 'Memproses', options = {}) {
    this.sock = sock;
    this.jid = jid;
    this.label = taskLabel;
    this.startedAt = Date.now();
    this.spinnerIdx = 0;
    this.msgKey = null;
    this.interval = null;
    this.stopped = false;
    this.percent = 0;     // 0..100
    this.note = '';       // keterangan langkah saat ini
    this.minEditMs = options.minEditMs ?? 1200; // debounce edit
    this._lastEdit = 0;
    this._typingTimer = null;
    this.onCancel = options.onCancel || null;
  }

  async _ensureMessage() {
    if (this.msgKey) return;
    const sent = await this.sock.sendMessage(this.jid, { text: '⏳ ' + this.label });
    this.msgKey = sent.key;
  }

  async _sendPresence(type) {
    try { await this.sock.sendPresenceUpdate(type, this.jid); } catch {}
  }

  _scheduleTyping() {
    const tick = async () => {
      if (this.stopped) return;
      await this._sendPresence('composing');
      this._typingTimer = setTimeout(tick, 6000);
    };
    tick();
  }

  _render() {
    const spin = SPINNER[this.spinnerIdx % SPINNER.length];
    this.spinnerIdx++;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    const bar = buildBar(this.percent);
    const lines = [
      `${spin} *${this.label}*`,
      `${bar} ${this.percent.toString().padStart(3,' ')}%`,
      this.note ? `• ${this.note}` : null,
      `⏱️ ${fmtHMS(elapsed)}  |  ketik *.cancel* untuk membatalkan`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  async _editNow() {
    if (!this.msgKey) return;
    const text = this._render();
    try {
      await this.sock.sendMessage(this.jid, { text, edit: this.msgKey });
      return true;
    } catch {
      // kalau edit expire, kirim baru & ambil key baru
      const sent = await this.sock.sendMessage(this.jid, { text });
      this.msgKey = sent.key;
      return false;
    }
  }

  async start() {
    await this._ensureMessage();
    this._scheduleTyping();
    this.interval = setInterval(async () => {
      if (this.stopped) return;
      const now = Date.now();
      if (now - this._lastEdit >= this.minEditMs) {
        await this._editNow();
        this._lastEdit = now;
      }
    }, 600);
  }

  async update({ percent, note }) {
    if (typeof percent === 'number') {
      this.percent = Math.min(100, Math.max(0, Math.round(percent)));
    }
    if (typeof note === 'string') this.note = note;
    // push edit bila cukup waktu
    const now = Date.now();
    if (now - this._lastEdit >= this.minEditMs) {
      await this._editNow();
      this._lastEdit = now;
    }
  }

  async done(msg = 'Selesai.') {
    this.stopped = true;
    if (this.interval) clearInterval(this.interval);
    if (this._typingTimer) clearTimeout(this._typingTimer);
    this.percent = 100;
    this.note = msg;
    await this._editNow();
    await this._sendPresence('paused');
  }

  async fail(msg = 'Gagal.') {
    this.stopped = true;
    if (this.interval) clearInterval(this.interval);
    if (this._typingTimer) clearTimeout(this._typingTimer);
    this.note = `⚠️ ${msg}`;
    await this._editNow();
    await this._sendPresence('paused');
  }
}

module.exports = { Progress };
