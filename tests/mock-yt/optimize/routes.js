// Trang gia cho tinh nang "Toi uu video" (src/flows/optimize.js)
module.exports = [
  // cu the hon route bat-tat-ca /studio/channel/UC... cua accounts (server xep route theo do dai mau)
  [/^\/studio\/channel\/(UC[\w-]{22})\/videos\/(upload|live|short)(\?.*)?$/, 'noi-dung.html'],
  [/^\/studio\/video\/([\w-]+)\/edit/, 'chi-tiet-video.html'],
  [/^\/yt\/watch\?v=([\w-]+)/, 'xem-video.html'],
  // HTML that cua Studio / YouTube (cat tu html/yt-2,3,4,5,10) de kiem tung bo chon cua luong
  [/^\/studio\/that-optimize\/([\w-]+)/, (req, res, m) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(require('fs').readFileSync(require('path').join(__dirname, 'that', m[1] + '.html')))
  }],
]
