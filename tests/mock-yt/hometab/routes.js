// Trang gia "Tuy chinh kenh → The Trang chu" cua YouTube Studio.
const fs = require('fs')
const path = require('path')
const { CHANNELS, CHANNEL_DB, PLAYLIST_DB } = require('./fixtures')

function hometab(req, res, m) {
  const ch = Object.values(CHANNELS).find((c) => c.ucId === m[1])
  if (!ch) { res.statusCode = 404; return res.end('khong co kenh gia ' + m[1]) }
  const data = { ...ch, channelDb: CHANNEL_DB, playlistDb: PLAYLIST_DB }
  const html = fs.readFileSync(path.join(__dirname, 'the-trang-chu.html'), 'utf8')
    .replace('/*FIXTURE*/', `window.__FIX = ${JSON.stringify(data)};`)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(html)
}

module.exports = [
  [/^\/studio\/channel\/(UC[\w-]+)\/editing\/hometab/, hometab],
  // cay con cat tu HTML that cua Studio (html/yt-8, yt-9-editing-hometab.html) de kiem bo chon
  [/^\/studio\/that-hometab\/yt8/, 'that-yt8.html'],
  [/^\/studio\/that-hometab\/yt9/, 'that-yt9.html'],
]
