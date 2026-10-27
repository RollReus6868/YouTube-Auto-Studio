// Trang gia: hop thoai "Tai video len" cua YouTube Studio (src/flows/upload.js).
// /studio/channel/UC.../videos/upload?d=ud: trang Noi dung + hop thoai tai len tu mo.
// Ket thuc (bam Xuat ban / Luu / Len lich) -> su kien { type: 'upload', ... } (server.events) va server.uploadsDb.
// Kenh dang chon trong phien (cookie MOCK_CH cua tests/mock-yt/accounts) duoc ghi kem de bai kiem doi chieu.
const fs = require('fs')
const path = require('path')

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => {
  const i = c.indexOf('=')
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]
}))

module.exports = [
  // cu the hon route Noi dung cua optimize (/videos/upload...) va route bat-tat-ca /studio/channel/UC... cua accounts
  [/^\/studio\/channel\/(UC[\w-]{22})\/videos\/upload\?(?:[^#]*&)?d=ud(?:&[^#]*)?$/, (req, res, m) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    const data = { uc: m[1], cookieCh: cookies(req).MOCK_CH || '' }
    res.end(fs.readFileSync(path.join(__dirname, 'upload.html'), 'utf8').replace('/*DATA*/null', JSON.stringify(data)))
  }],
  [/^\/studio\/__upload\/done$/, (req, res, m, server) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const u = JSON.parse(body)
      ;(server.uploadsDb = server.uploadsDb || []).push(u)
      server.events.push({ type: 'upload', ...u })
      res.end('ok')
    })
  }],
]
