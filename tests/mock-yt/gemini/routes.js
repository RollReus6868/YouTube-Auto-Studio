// Trang Gemini gia (thay cho https://gemini.google.com): /gemini/app (chat moi), /gemini/app/<id> (sau khi gui).
// Cau truc DOM chep theo trang that do ngay 11/11/2026 (xem app.html).
// Bai kiem dieu khien qua may chu:
//   server.geminiFlags = { signedOut, blockedDialog, limit, slow: ms, pendingStuck, chunkMs, imageMs }  (doc luc tai trang)
//   server.geminiQueue = [{ text } | { image: true, text? } | { error: 'limit' | 'signin' }, ...]  (het hang -> echo)
//   server.geminiPrompts: loi nhac trang da nhan; server.geminiImages[n]: byte anh gia thu n; server.geminiImgHits: [{ n, cookie }]
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const json = (res, data) => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)) }

// PNG that (giai ma duoc) w x h mot mau
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.alloc(w * 3 + 1)
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const COOKIE = 'MOCK_GEMINI_SID=ok'

module.exports = [
  // gemini.google.com bat Trusted Types nhu youtube.com: trang gia cung bat (eval chuoi trong trang bi chan)
  [/^\/gemini\/app(\/[\w-]+)?\/?(\?.*)?$/, (req, res, m, server) => {
    const flags = server.geminiFlags || {}
    server.geminiLoads = (server.geminiLoads || 0) + 1
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('content-security-policy', "require-trusted-types-for 'script'")
    // da dang nhap: cookie phien gia (HttpOnly) - anh chi tai duoc khi gui kem cookie nay
    if (!flags.signedOut) res.setHeader('set-cookie', `${COOKIE}; Path=/; HttpOnly`)
    const html = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8').replace('/*FLAGS*/', `window.FLAGS = ${JSON.stringify(flags)};`)
    res.end(html)
  }],
  [/^\/gemini\/__ask$/, (req, res, m, server) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let prompt = ''
      try { prompt = JSON.parse(body).prompt || '' } catch (_) { /* bo */ }
      ;(server.geminiPrompts = server.geminiPrompts || []).push(prompt)
      const q = server.geminiQueue || []
      const item = q.length ? { ...q.shift() } : { text: `Echo: ${prompt.slice(0, 200)}` }
      if (item.image) {
        server.geminiImages = server.geminiImages || {}
        const n = Object.keys(server.geminiImages).length + 1
        server.geminiImages[n] = png(1024, 1024, [40 * n % 256, 120, 200])
        item.src = `/gemini/__img/${n}.png`
      }
      json(res, item)
    })
  }],
  [/^\/gemini\/__img\/(\d+)\.png/, (req, res, m, server) => {
    const cookie = String(req.headers.cookie || '')
    ;(server.geminiImgHits = server.geminiImgHits || []).push({ n: Number(m[1]), cookie: cookie.includes(COOKIE) })
    const buf = (server.geminiImages || {})[m[1]]
    if (!buf) { res.statusCode = 404; return res.end('khong co anh') }
    if (!cookie.includes(COOKIE)) { res.statusCode = 403; res.setHeader('content-type', 'text/html'); return res.end('<p>403 - chua dang nhap</p>') }
    res.setHeader('content-type', 'image/png')
    res.end(buf)
  }],
]
