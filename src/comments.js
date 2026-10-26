// Ban tra loi binh luan: gom binh luan moi, nho cai nao da tra loi / bo qua (comments.json),
// loc tu cam, gioi han so tra loi moi gio, quyet dinh cai nao duoc tu gui.
// Khong require('electron') de kiem thu bang node.
const fs = require('fs')
const path = require('path')

const KEEP = 500 // so binh luan giu trong danh sach
const AUTO_MAX_LEN = 220

class CommentDesk {
  constructor(dir) {
    this.file = path.join(dir, 'comments.json')
    let d = {}
    try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch (_) { /* lan dau */ }
    this.items = Array.isArray(d.items) ? d.items : []
    this.sent = Array.isArray(d.sent) ? d.sent : [] // moc thoi gian da gui (ms) de gioi han moi gio
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify({ items: this.items.slice(0, KEEP), sent: this.sent.filter((t) => t > Date.now() - 3600e3) }))
  }

  get(id) { return this.items.find((x) => x.id === id) }

  // fetched: ket qua Google.channelComments; tra ve so binh luan moi
  merge(fetched, { channelId, titles = {}, skipWords = '' }) {
    const words = String(skipWords).split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
    let added = 0
    for (const c of fetched) {
      if (this.get(c.commentId)) continue
      if (c.authorChannelId === channelId || c.ownerReplied) continue // binh luan cua chinh kenh / da tra loi tren YouTube
      const item = {
        id: c.commentId, videoId: c.videoId, videoTitle: titles[c.videoId] || '', author: c.author, text: c.text,
        publishedAt: c.publishedAt, likeCount: c.likeCount, status: 'new', kind: '', draft: '', error: '', note: '',
      }
      const low = c.text.toLowerCase()
      const hit = words.find((w) => low.includes(w))
      if (hit) Object.assign(item, { status: 'skipped', note: `Chứa từ bỏ qua "${hit}"` })
      else if (/https?:\/\/|www\./i.test(c.text)) Object.assign(item, { status: 'skipped', note: 'Có đường link' })
      this.items.push(item)
      added++
    }
    this.items.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    this.save()
    return added
  }

  update(id, patch) {
    const it = this.get(id)
    if (it) Object.assign(it, patch)
    this.save()
    return it
  }

  sentLastHour(now = Date.now()) { return this.sent.filter((t) => t > now - 3600e3).length }
  canSend(limit, now = Date.now()) { return this.sentLastHour(now) < Math.max(1, Number(limit) || 1) }
  markSent(id, replyText, now = Date.now()) {
    this.sent.push(now)
    return this.update(id, { status: 'sent', draft: replyText, sentAt: new Date(now).toISOString(), error: '' })
  }

  // Chi tu gui loi khen ngan; cau hoi, gop y, nhay cam luon cho duyet tay
  static autoOk(item) {
    return item.kind === 'khen' && item.draft && [...item.draft].length <= AUTO_MAX_LEN
  }

  pending() { return this.items.filter((x) => x.status === 'new' || x.status === 'ready' || x.status === 'error') }
}

module.exports = { CommentDesk, AUTO_MAX_LEN }
