// May chu gia lap YouTube / YouTube Studio cho bai kiem cac luong tu dong.
// Moi tinh nang co thu muc rieng tests/mock-yt/<ten>/ gom cac trang .html va routes.js:
//   module.exports = [[/^\/studio\/video\/([\w-]+)\/edit/, 'chi-tiet-video.html'], ...]
// (ve phai: ten file trong thu muc do, hoac ham (req, res, m) tu tra loi).
// Duong dan: /studio/... thay cho https://studio.youtube.com/..., /yt/... thay cho https://www.youtube.com/...
const fs = require('fs')
const http = require('http')
const path = require('path')

function loadRoutes() {
  const routes = []
  for (const d of fs.readdirSync(__dirname)) {
    const file = path.join(__dirname, d, 'routes.js')
    if (!fs.existsSync(file)) continue
    for (const [re, handler] of require(file)) routes.push({ re, handler, dir: path.join(__dirname, d) })
  }
  return routes
}

function startMockYt() {
  const routes = loadRoutes()
  const hits = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    hits.push(req.method + ' ' + url.pathname + url.search)
    // trang gia co the bao ket qua ve may chu de bai kiem doc lai
    if (url.pathname === '/__log' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => { try { server.events.push(JSON.parse(body)) } catch (_) { /* bo */ } res.end('ok') })
      return
    }
    if (url.pathname.startsWith('/__file/')) {
      const f = path.join(__dirname, url.pathname.slice(8))
      if (f.startsWith(__dirname) && fs.existsSync(f)) return res.end(fs.readFileSync(f))
    }
    for (const r of routes) {
      const m = r.re.exec(url.pathname + url.search)
      if (!m) continue
      if (typeof r.handler === 'function') return r.handler(req, res, m, server)
      res.setHeader('content-type', 'text/html; charset=utf-8')
      return res.end(fs.readFileSync(path.join(r.dir, r.handler)))
    }
    res.statusCode = 404
    res.end('khong co trang gia cho ' + url.pathname)
  })
  server.events = []
  server.hits = hits
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`
    resolve({
      server, base, events: server.events, hits,
      urls: { studio: `${base}/studio`, youtube: `${base}/yt` },
      close: () => new Promise((r) => server.close(r)),
    })
  }))
}

module.exports = { startMockYt }
