// Trang gia cho tinh nang "Toi uu video" (src/flows/optimize.js)
module.exports = [
  [/^\/studio\/channel\/(UC[\w-]+)\/videos/, 'noi-dung.html'],
  [/^\/studio\/video\/([\w-]+)\/edit/, 'chi-tiet-video.html'],
  [/^\/yt\/watch\?v=([\w-]+)/, 'xem-video.html'],
]
