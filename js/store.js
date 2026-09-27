/* =============================================================
 * store.js — Lớp lưu trữ REALTIME (đa hình)
 * -------------------------------------------------------------
 * Cùng 1 API cho 2 backend:
 *   - FirebaseStore  : Firebase Realtime Database (thật, online)
 *   - MockStore      : localStorage + BroadcastChannel (offline,
 *                      nhiều tab vẫn realtime -> test được ngay)
 *
 * API công khai:
 *   const room = await openRoom(code, { role, femaleId, name });
 *   room.onState(cb);      // cb nhận RAW remote object (giống Firebase snapshot.val())
 *   room.onPresence(cb);   // cb nhận mảng người đang online
 *   await room.updateMeta({ phase: 'bidding', ... });
 *   await room.setBid(femaleId, amount);
 *   await room.writeTeams(teamsObj);
 *   room.close();
 * ============================================================= */
import { firebaseConfig, isConfigured } from './firebase-config.js';
import { SETTINGS, FEMALES, MALES } from './config.js';

const FB_VERSION = '10.12.2';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

/* =============================================================
 * CHUYỂN ĐỔI DỮ LIỆU  (engine <-> firebase-friendly)
 * ============================================================= */
export function teamsToRemote(teams) {
  const out = {};
  for (const [fid, t] of Object.entries(teams)) {
    out[fid] = {
      budget: t.budget,
      spent: t.spent,
      maleIds: t.maleIds.reduce((o, id) => (o[id] = true, o), {}),
    };
  }
  return out;
}

export function teamsFromRemote(remote, femaleIds = Object.keys(remote || {})) {
  const out = {};
  for (const fid of femaleIds) {
    const t = (remote && remote[fid]) || {};
    out[fid] = {
      femaleId: fid,
      budget: t.budget ?? 0,
      spent: t.spent ?? 0,
      maleIds: t.maleIds ? Object.keys(t.maleIds) : [],
    };
  }
  return out;
}

/** Ghép dữ liệu remote thành state engine đầy đủ. */
export function remoteToState(remote, females = FEMALES) {
  if (!remote) return null;
  const meta = remote.meta || {};
  return {
    phase: meta.phase || 'lobby',
    round: meta.round || 1,
    currentMaleId: meta.currentMaleId || null,
    bids: remote.bids || {},
    pending: remote.pending || {},
    teams: teamsFromRemote(remote.teams, females.map(f => f.id)),
    boughtMaleIds: meta.boughtMaleIds ? Object.keys(meta.boughtMaleIds) : [],
    usedMales: meta.usedMales ? Object.keys(meta.usedMales) : [],
    log: meta.log || [],
    reveal: meta.reveal || null,
    roundEndsAt: meta.roundEndsAt || 0,
    hostOnline: !!meta.hostOnline,
  };
}

/* =============================================================
 * MOCK STORE — offline, đa tab realtime
 * ============================================================= */
class MockStore {
  constructor(code) {
    this.code = code;
    this.key = `auction:${code}`;
    this.chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(this.key) : null;
    this.stateCbs = [];
    this.presenceCbs = [];
    this.statusCb = () => {};
    this.clientId = 'c' + Math.random().toString(36).slice(2, 10);
    this._onChan = (ev) => {
      if (ev && ev.data && ev.data.from === this.clientId) return;
      this._emit();
    };
    this._onStorage = (ev) => { if (ev.key === this.key) this._emit(); };
    this._hb = null;
  }

  _read() {
    try { return JSON.parse(localStorage.getItem(this.key)) || null; } catch { return null; }
  }

  _write(data) {
    data.updatedAt = Date.now();
    localStorage.setItem(this.key, JSON.stringify(data));
    if (this.chan) this.chan.postMessage({ from: this.clientId, t: Date.now() });
    this._emit();
  }

  _ensure() {
    let d = this._read();
    if (!d) {
      d = { meta: { phase: 'lobby', round: 1, createdAt: Date.now() }, bids: {}, teams: {}, presence: {} };
      localStorage.setItem(this.key, JSON.stringify(d));
    }
    return d;
  }

  async connect() {
    this._ensure();
    if (this.chan) this.chan.addEventListener('message', this._onChan);
    window.addEventListener('storage', this._onStorage);
    this._emit();
  }

  _emit() {
    const d = this._read();
    for (const cb of this.stateCbs) cb(d);              // raw remote object
    const list = this._presenceList(d);
    for (const cb of this.presenceCbs) cb(list);
  }

  _presenceList(d) {
    const now = Date.now();
    const p = (d && d.presence) || {};
    return Object.entries(p)
      .map(([id, v]) => ({ id, ...v }))
      .filter(x => now - (x.ts || 0) < 15000);
  }

  async updateMeta(patch) {
    const d = this._ensure();
    d.meta = { ...d.meta, ...patch };
    this._write(d);
  }

  async setBid(femaleId, amount) {
    const d = this._ensure();
    d.bids = d.bids || {};
    d.bids[femaleId] = amount;
    this._write(d);
  }

  /** Người chơi gửi ý định trả giá — host sẽ xác nhận. */
  async submitBid(femaleId, amount) {
    const d = this._ensure();
    d.pending = d.pending || {};
    d.pending[femaleId] = { amount, ts: Date.now() };
    this._write(d);
  }

  /** Ghi giá đã được host xác nhận (hiển thị công khai). */
  async writeBids(bids, roundEndsAt) {
    const d = this._ensure();
    d.bids = { ...bids };
    if (roundEndsAt) d.meta.roundEndsAt = roundEndsAt;
    this._write(d);
  }

  /** Xoá pending sau khi host đã xử lý. */
  async clearPending() {
    const d = this._ensure();
    d.pending = {};
    this._write(d);
  }

  async clearBids() {
    const d = this._ensure();
    d.bids = {};
    this._write(d);
  }

  async writeTeams(teams) {
    const d = this._ensure();
    d.teams = teamsToRemote(teams);
    this._write(d);
  }

  /** Xoá sạch phòng (bids, meta, teams) nhưng giữ presence hiện tại. */
  async resetRoom(teams) {
    const d = this._ensure();
    d.meta = { phase: 'lobby', round: 1, createdAt: Date.now() };
    d.bids = {};
    d.teams = teams ? teamsToRemote(teams) : {};
    this._write(d);
  }

  async initTeams(teams) {
    const d = this._ensure();
    if (!d.teams || Object.keys(d.teams).length === 0) {
      d.teams = teamsToRemote(teams);
      this._write(d);
    }
  }

  async writeUsed(maleIds, boughtIds) {
    const d = this._ensure();
    d.meta.usedMales = maleIds.reduce((o, id) => (o[id] = true, o), {});
    d.meta.boughtMaleIds = boughtIds.reduce((o, id) => (o[id] = true, o), {});
    this._write(d);
  }

  async writeLog(log) {
    const d = this._ensure();
    d.meta.log = log;
    this._write(d);
  }

  async setPresence(info) {
    const d = this._ensure();
    d.presence = d.presence || {};
    d.presence[this.clientId] = { ...info, ts: Date.now() };
    // dọn presence cũ
    const now = Date.now();
    for (const [id, v] of Object.entries(d.presence)) {
      if (now - (v.ts || 0) > 15000) delete d.presence[id];
    }
    this._write(d);
    if (!this._hb) {
      this._hb = setInterval(() => this.setPresence(info), 5000);
    }
  }

  async setHostOnline(v) { return this.updateMeta({ hostOnline: !!v }); }

  /** Rời phòng: xoá presence ngay để host thấy offline liền. */
  async clearPresence() {
    const d = this._ensure();
    if (d.presence) delete d.presence[this.clientId];
    this._write(d);
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
  }

  onState(cb) {
    this.stateCbs.push(cb);
    // Phát ngay trạng thái hiện tại — tránh mất event khi đăng ký sau connect()
    const d = this._read();
    cb(d);                                  // raw remote object
    const list = this._presenceList(d);
    for (const p of this.presenceCbs) p(list);
  }
  onPresence(cb) {
    this.presenceCbs.push(cb);
    cb(this._presenceList(this._read()));
  }
  onStatus(cb) { this.statusCb = cb; cb({ connected: true, error: null }); }

  close() {
    if (this.chan) { this.chan.removeEventListener('message', this._onChan); this.chan.close(); }
    window.removeEventListener('storage', this._onStorage);
    if (this._hb) clearInterval(this._hb);
  }
}

/* =============================================================
 * FIREBASE STORE — realtime database thật
 * ============================================================= */
class FirebaseStore {
  constructor(code) {
    this.code = code;
    this.ref = null;
    this.stateCbs = [];
    this.presenceCbs = [];
    this.statusCb = () => {};
    this.clientId = 'c' + Math.random().toString(36).slice(2, 10);
    this._unsub = [];
    this._latest = null;
    this.connected = false;
    this.lastError = null;
  }

  async connect() {
    const appMod = await import(`${FB_BASE}/firebase-app.js`);
    const dbMod = await import(`${FB_BASE}/firebase-database.js`);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
    this.db = dbMod.getDatabase(app);
    this.fns = dbMod;
    this.root = dbMod.ref(this.db, `rooms/${this.code}`);

    // Theo dõi kết nối THẬT tới Firebase (.info/connected)
    this._unsub.push(dbMod.onValue(dbMod.ref(this.db, '.info/connected'), snap => {
      this.connected = snap.val() === true;
      if (this.connected) {
        this.lastError = null;
        if (this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
      }
      this.statusCb({ connected: this.connected, error: this.lastError });
    }));

    // Watchdog: nếu sau 8s vẫn chưa kết nối -> báo lỗi (DB bị lock/tắt mạng)
    this._watchdog = setTimeout(() => {
      if (!this.connected) {
        this.lastError = 'Không kết nối được Firebase Realtime Database.\n' +
          'Kiểm tra: (1) databaseURL đúng, (2) database chưa bị vô hiệu hoá ' +
          '(Console → Realtime Database), (3) rules cho phép đọc/ghi.';
        this.statusCb({ connected: false, error: this.lastError });
      }
    }, 8000);

    // Probe: đọc thật 1 lần để phát hiện DB bị vô hiệu hoá (HTTP 423 Locked).
    // .info/connected vẫn = true khi DB bị lock, nên phải thử đọc dữ liệu.
    this._probe();

    this._unsub.push(dbMod.onValue(this.root, snap => {
      this._latest = snap.val();
      for (const cb of this.stateCbs) cb(this._latest);   // raw remote object
    }, err => {
      // Ví dụ: database bị deactivated, hoặc rules từ chối
      this.lastError = (err && err.message) || 'Không đọc được dữ liệu Firebase';
      this.connected = false;
      this.statusCb({ connected: false, error: this.lastError });
    }));

    this._unsub.push(dbMod.onValue(dbMod.ref(this.db, `rooms/${this.code}/presence`), snap => {
      const now = Date.now();
      const p = snap.val() || {};
      const list = Object.entries(p)
        .map(([id, v]) => ({ id, ...v }))
        .filter(x => now - (x.ts || 0) < 60000);
      for (const cb of this.presenceCbs) cb(list);
    }));
  }

  /**
   * Thử GHI 1 giá trị tạm để phát hiện database bị vô hiệu hoá (HTTP 423 Locked).
   * Đọc có thể vẫn "thành công" (trả null) khi DB bị lock, nên phải thử ghi.
   * Bọc timeout để không treo UI khi mạng/DB không phản hồi.
   */
  _probe() {
    const probeRef = this.fns.ref(this.db, `rooms/${this.code}/_health`);
    const timeoutMs = 12000;
    const timer = new Promise(res => setTimeout(() => res({ __timeout: true }), timeoutMs));

    const attempt = this.fns.set(probeRef, Date.now())
      .then(() => this.fns.remove(probeRef))
      .then(() => ({ ok: true }))
      .catch(e => ({ err: e }));

    Promise.race([attempt, timer]).then(out => {
      if (out.__timeout) {
        this.lastError = `Firebase không phản hồi sau ${timeoutMs / 1000}s.\n` +
          'Kiểm tra databaseURL và trạng thái Realtime Database trong Firebase Console.';
      } else if (out.err) {
        const code = out.err.code || '';
        const msg = (out.err.message || '').split('\n')[0];
        if (code === 'PERMISSION_DENIED') {
          this.lastError = 'Firebase từ chối truy cập (PERMISSION_DENIED).\n' +
            'Hãy dán nội dung firebase-rules.json vào tab Rules rồi bấm Publish.';
        } else {
          this.lastError = `Không ghi được lên Firebase: ${msg || code || 'lỗi không xác định'}.\n` +
            'Nếu database báo "deactivated", hãy tạo lại Realtime Database trong Firebase Console.';
        }
      } else {
        this.connected = true;
        this.lastError = null;
        this.statusCb({ connected: true, error: null });
        return;
      }
      this.connected = false;
      this.statusCb({ connected: false, error: this.lastError });
    });
  }

  async updateMeta(patch) { return this.fns.update(this.root, { meta: { ...(this._latest?.meta || {}), ...patch } }); }
  async setBid(femaleId, amount) { return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/bids/${femaleId}`), amount); }
  async clearBids() { return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/bids`), null); }
  /** Người chơi gửi ý định trả giá — host sẽ xác nhận. */
  async submitBid(femaleId, amount) {
    return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/pending/${femaleId}`), { amount, ts: Date.now() });
  }
  /** Ghi giá đã được host xác nhận (công khai). */
  async writeBids(bids, roundEndsAt) {
    const payload = { bids: { ...bids } };
    if (roundEndsAt) payload['meta/roundEndsAt'] = roundEndsAt;
    return this.fns.update(this.fns.ref(this.db, `rooms/${this.code}`), payload);
  }
  /** Xoá pending sau khi host đã xử lý. */
  async clearPending() {
    return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/pending`), null);
  }
  /** Xoá sạch phòng (bids, meta, teams) trên Firebase — GIỮ presence. */
  async resetRoom(teams) {
    return this.fns.update(this.fns.ref(this.db, `rooms/${this.code}`), {
      meta: { phase: 'lobby', round: 1, createdAt: Date.now(), hostOnline: true },
      bids: null,
      teams: teams ? teamsToRemote(teams) : null,
    });
  }
  async writeTeams(teams) { return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/teams`), teamsToRemote(teams)); }
  async initTeams(teams) {
    if (this._latest && this._latest.teams && Object.keys(this._latest.teams).length) return;
    return this.writeTeams(teams);
  }
  async writeUsed(maleIds, boughtIds) {
    return this.fns.update(this.root, {
      'meta/usedMales': maleIds.reduce((o, id) => (o[id] = true, o), {}),
      'meta/boughtMaleIds': boughtIds.reduce((o, id) => (o[id] = true, o), {}),
    });
  }
  async writeLog(log) { return this.fns.set(this.fns.ref(this.db, `rooms/${this.code}/meta/log`), log); }

  async setPresence(info) {
    const pRef = this.fns.ref(this.db, `rooms/${this.code}/presence/${this.clientId}`);
    await this.fns.set(pRef, { ...info, ts: Date.now() });
    this.fns.onDisconnect(pRef).remove();
    if (!this._hb) this._hb = setInterval(() => this.fns.set(pRef, { ...info, ts: Date.now() }), 20000);
    this._presenceRef = pRef;
  }

  /** Rời phòng: xoá presence ngay để host thấy offline liền. */
  async clearPresence() {
    if (this._presenceRef) {
      try { await this.fns.remove(this._presenceRef); } catch {}
    }
  }

  async setHostOnline(v) {
    const hRef = this.fns.ref(this.db, `rooms/${this.code}/meta/hostOnline`);
    if (v) {
      await this.fns.set(hRef, true);
      this.fns.onDisconnect(hRef).set(false);
    } else {
      await this.fns.set(hRef, false);
    }
  }

  onState(cb) {
    this.stateCbs.push(cb);
    // Nếu đã có dữ liệu thì phát ngay, tránh màn hình trắng tới lần cập nhật kế tiếp
    if (this._latest !== null) cb(this._latest);   // raw remote object
  }
  onPresence(cb) { this.presenceCbs.push(cb); }
  onStatus(cb) {
    this.statusCb = cb;
    cb({ connected: this.connected, error: this.lastError });
  }

  close() { this._unsub.forEach(u => u()); if (this._hb) clearInterval(this._hb); if (this._watchdog) clearTimeout(this._watchdog); }
}

/* =============================================================
 * FACTORY
 * ============================================================= */
export function openRoom(code, opts = {}) {
  const store = isConfigured() ? new FirebaseStore(code) : new MockStore(code);
  store.mode = isConfigured() ? 'firebase' : 'mock';
  return store;
}

export { SETTINGS, FEMALES, MALES };