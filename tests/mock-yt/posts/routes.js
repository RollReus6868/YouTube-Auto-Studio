// Trang gia: tab "Bai dang" cua kenh tren youtube.com (khung soan bai + DA DANG / DA LEN LICH).
// Bai da dang luu trong server.postsDb (bai kiem dat san de thu kiem tra trung).
const json = (res, data) => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)) }
const db = (server) => (server.postsDb = server.postsDb || [])

module.exports = [
  [/^\/yt\/(channel\/UC[\w-]+|@[\w.-]+)\/posts(\?.*)?$/, 'posts.html'],
  [/^\/yt\/__posts\/list\?tab=(\w+)/, (req, res, m, server) => {
    const sched = m[1] === 'sched'
    json(res, db(server).filter((p) => !!p.scheduledAt === sched).slice().reverse())
  }],
  [/^\/yt\/__posts\/add$/, (req, res, m, server) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const p = JSON.parse(body)
      p.id = `UgkxMock${String(db(server).length + 1).padStart(4, '0')}`
      db(server).push(p)
      server.events.push({ type: 'post', ...p })
      json(res, { id: p.id })
    })
  }],
  [/^\/yt\/post\/([\w-]+)/, (req, res, m) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(`<!doctype html><meta charset="utf-8"><title>${m[1]}</title><p>Bài đăng ${m[1]}</p>`) }],
]
