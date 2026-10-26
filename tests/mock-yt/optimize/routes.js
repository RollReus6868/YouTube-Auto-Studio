// Trang gia cho tinh nang "Toi uu video" (src/flows/optimize.js)
module.exports = [
  // cu the hon route bat-tat-ca /studio/channel/UC... cua accounts (server xep route theo do dai mau)
  [/^\/studio\/channel\/(UC[\w-]{22})\/videos\/(upload|live|short)(\?.*)?$/, 'noi-dung.html'],
  [/^\/studio\/video\/([\w-]+)\/edit/, 'chi-tiet-video.html'],
  [/^\/yt\/watch\?v=([\w-]+)/, 'xem-video.html'],
]
