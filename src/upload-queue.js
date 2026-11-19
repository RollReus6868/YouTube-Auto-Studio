// Hang cho dang video (trang Dang video): nhieu hang cho chay CUNG LUC, video trong cung mot hang cho chay LAN LUOT.
// Moi hang cho dang chay giu mot "luong" (lane): luong 0 = khung trinh duyet ben phai / cua so cua tai khoan (ctx.withChannel
// thuong), luong 1, 2... = cua so dang video rieng (src/features/accounts.js, worker). Toi da `parallel` hang cho chay cung luc;
// hang cho khac doi toi khi co luong ranh. Ham thuan (khong require electron) de kiem bang node: tests/upload-queue-test.js.
//
//   const q = new UploadQueue({ parallel: 2, runOne: (job, lane) => Promise, onChange: () => {} })
//   q.add([{ id, queue: 'q1' }, ...])   // them viec (ke ca luc dang chay); id da co thi bo qua
//   q.done                               // Promise: xong het (khong con viec nao chay / cho)
//   q.stopStarting()                     // khong bat dau video moi (video dang tai van chay toi xong)
//   q.cancel(id)                         // bo mot video con dang cho -> true
//   q.snapshot()                         // [{ key, lane, running, waiting: [id] }] cho giao dien
class UploadQueue {
  constructor({ parallel = 1, runOne, onChange = () => {} } = {}) {
    this.parallel = clamp(parallel)
    this.runOne = runOne
    this.onChange = onChange
    this.queues = new Map() // key -> { key, items: [job], running: job|null, lane: number|null }
    this.order = [] // thu tu hang cho (hang cho them truoc chay truoc khi het cho)
    this.seen = new Set()
    this.stopping = false
    this.finished = false
    this.active = 0
    this._resolve = null
    this.done = new Promise((r) => { this._resolve = r })
  }

  setParallel(n) { this.parallel = clamp(n); this._pump() }

  // tra ve so viec da them; -1 neu hang cho da xong han (tao hang cho moi)
  add(jobs) {
    if (this.finished) return -1
    let n = 0
    for (const j of jobs) {
      if (!j || !j.id || this.seen.has(j.id)) continue
      this.seen.add(j.id)
      const key = String(j.queue || 'q1')
      if (!this.queues.has(key)) { this.queues.set(key, { key, items: [], running: null, lane: null }); this.order.push(key) }
      this.queues.get(key).items.push(j)
      n++
    }
    if (n) { this.stopping = false; this._pump() }
    else this._maybeDone()
    return n
  }

  cancel(id) {
    for (const q of this.queues.values()) {
      const i = q.items.findIndex((j) => j.id === id)
      if (i >= 0) { q.items.splice(i, 1); this.seen.delete(id); this.onChange(); this._maybeDone(); return true }
    }
    return false
  }

  stopStarting() { this.stopping = true; this.onChange(); this._maybeDone() }

  // con video dang chay / dang cho
  busy() { return this.active > 0 || (!this.stopping && [...this.queues.values()].some((q) => q.items.length)) }

  // viec chua bat dau (bi bo khi dung)
  pending() { return [...this.queues.values()].flatMap((q) => q.items) }

  snapshot() {
    return this.order.map((k) => this.queues.get(k)).filter((q) => q && (q.running || q.items.length))
      .map((q) => ({ key: q.key, lane: q.lane, running: q.running ? q.running.id : '', waiting: q.items.map((j) => j.id) }))
  }

  _freeLane() {
    const used = new Set([...this.queues.values()].filter((q) => q.lane !== null).map((q) => q.lane))
    for (let i = 0; ; i++) if (!used.has(i)) return i
  }

  _pump() {
    if (this.stopping) return this._maybeDone()
    for (const key of this.order) {
      if (this.active >= this.parallel) break
      const q = this.queues.get(key)
      if (q.lane !== null || !q.items.length) continue
      q.lane = this._freeLane()
      this.active++
      this._loop(q)
    }
    this.onChange()
    this._maybeDone()
  }

  async _loop(q) {
    try {
      while (q.items.length && !this.stopping) {
        const job = q.items.shift()
        q.running = job
        this.onChange()
        try { await this.runOne(job, q.lane) } catch (_) { /* runOne tu bao loi tung video */ }
        q.running = null
        this.onChange()
      }
    } finally {
      q.lane = null
      this.active--
      if (!q.items.length) { this.queues.delete(q.key); this.order = this.order.filter((k) => k !== q.key) }
      this._pump()
    }
  }

  _maybeDone() {
    if (this.active === 0 && (this.stopping || !this.pending().length) && this._resolve) {
      const r = this._resolve
      this._resolve = null
      this.finished = true
      r()
    }
  }
}

function clamp(n) { return Math.max(1, Math.min(MAX_PARALLEL, Math.floor(Number(n) || 1))) }
const MAX_PARALLEL = 4

// Khoa hang cho cua mot video: so 1..9 -> 'q<so>'; 'solo' -> hang cho rieng cua video (chay song song voi moi video khac)
function queueKey(q, id) {
  if (q === 'solo') return `solo:${id}`
  const n = Math.floor(Number(q) || 1)
  return `q${Math.max(1, Math.min(9, n))}`
}

module.exports = { UploadQueue, queueKey, MAX_PARALLEL }
