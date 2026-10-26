// Quet thu muc goc cua nguoi dung thanh hang doi:
//   <goc>/videos/<2026-10-28_ten-video>/ video.mp4, thumbnail.jpg, info.txt, phude.vi.srt
//   <goc>/posts/<2026-10-29_bai-1>/      noidung.txt, anh1.jpg ...
//   <goc>/da-dang/                       thu muc da xong duoc chuyen vao day
const fs = require('fs')
const path = require('path')

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv', '.flv', '.mpeg', '.mpg', '.3gp']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png']
const SUB_EXT = ['.srt', '.vtt']
const THUMB_MAX = 2 * 1024 * 1024 // YouTube: thumbnail toi da 2 MB
const POST_IMAGES_MAX = 10
const DIRS = { videos: 'videos', posts: 'posts', done: 'da-dang' }

const ext = (f) => path.extname(f).toLowerCase()
// "Tiêu đề" / "tieu_de" / "Tieu De" -> "tieu_de"
const key = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').trim().toLowerCase().replace(/[\s-]+/g, '_')

// Ten khoa trong info.txt -> ten truong noi bo
const ALIASES = {
  tieu_de: 'tieu_de', title: 'tieu_de',
  ten_video: 'ten_video',
  the: 'the', tags: 'the', tag: 'the',
  gio_dang: 'gio_dang', lich: 'gio_dang', publish: 'gio_dang',
  hien_thi: 'hien_thi', che_do: 'hien_thi',
  preset: 'preset', mau: 'preset',
  playlist: 'playlist', danh_sach_phat: 'playlist',
  so_tap: 'so_tap', tap: 'so_tap',
  tre_em: 'tre_em', danh_cho_tre_em: 'tre_em',
  ghi_chu: 'ghi_chu', note: 'ghi_chu',
  mo_ta: 'mo_ta', description: 'mo_ta',
}
const PRIVACY = { cong_khai: 'public', public: 'public', khong_cong_khai: 'unlisted', unlisted: 'unlisted', rieng_tu: 'private', private: 'private' }
const YES = /^(co|có|yes|true|1|x)$/i

// "2026-10-28 19:00" | "28/10/2026 19h00" -> Date gio dia phuong, sai thi null
function parseWhen(s) {
  s = String(s).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T_]+(\d{1,2})[:hH](\d{2}))?$/.exec(s)
  let y, mo, d, h, mi
  if (m) [, y, mo, d, h, mi] = m
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ _]+(\d{1,2})[:hH](\d{2}))?$/.exec(s))) [, d, mo, y, h, mi] = m
  else return null
  const date = new Date(+y, +mo - 1, +d, +(h || 0), +(mi || 0))
  return date.getMonth() === +mo - 1 && date.getDate() === +d ? date : null
}

// info.txt: dong "Khoa: gia tri" o tren; sau dong "---" (hoac khoa "Mô tả:" dung mot minh)
// la phan mo ta nhieu dong. Khoa la thi thanh bien {khoa} dung trong mau.
function parseInfo(text) {
  const info = { vars: {} }
  const warnings = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-{3,}\s*(mô tả|mo ta)?\s*-*\s*$/i.test(line)) { i++; break }
    const m = /^\s*([^:#][^:]{0,40}):\s*(.*)$/.exec(line)
    if (!m) continue
    const k = key(m[1])
    const v = m[2].trim()
    const field = ALIASES[k]
    if (field === 'mo_ta' && !v) { i++; break }
    if (!field) { info.vars[k] = v; continue }
    if (field === 'gio_dang') {
      const d = parseWhen(v)
      if (d) info.gio_dang = d
      else if (v) warnings.push(`info.txt: không hiểu giờ đăng "${v}" (viết dạng 2026-10-28 19:00).`)
    } else if (field === 'hien_thi') {
      if (PRIVACY[key(v)]) info.hien_thi = PRIVACY[key(v)]
      else if (v) warnings.push(`info.txt: không hiểu chế độ hiển thị "${v}" (công khai / không công khai / riêng tư).`)
    } else if (field === 'tre_em') info.tre_em = YES.test(v)
    else info[field] = v
  }
  const rest = lines.slice(i).join('\n').trim()
  if (rest) info.mo_ta = rest
  return { info, warnings }
}

// "2026-10-28_19h00_ten-video" -> { date, time, name }
function parseFolderName(dir) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ _](\d{1,2})[h:](\d{2}))?[ _-]+(.+)$/.exec(dir)
  const tidy = (s) => (/\s/.test(s) ? s : s.replace(/[-_]+/g, ' ')).trim()
  if (!m || !parseWhen(m[1])) return { date: null, time: null, name: tidy(dir) }
  return { date: m[1], time: m[2] ? `${m[2].padStart(2, '0')}:${m[3]}` : null, name: tidy(m[4]) }
}

const listDirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  } catch (_) { return [] }
}
const listFiles = (p) => fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))

function scanVideo(root, dir) {
  const folder = path.join(root, dir)
  const files = listFiles(folder)
  const { date, time, name } = parseFolderName(dir)
  const item = { kind: 'video', id: `videos/${dir}`, dir, folder, date, time, name, episode: (/(?:tap|tập|ep)[\s_-]*(\d+)/i.exec(dir) || [])[1] || '', video: null, thumbnail: null, subtitles: [], info: { vars: {} }, errors: [], warnings: [] }

  const videos = files.filter((f) => VIDEO_EXT.includes(ext(f)))
  if (!videos.length) item.errors.push('Không có file video trong thư mục.')
  else {
    item.video = path.join(folder, videos[0])
    item.size = fs.statSync(item.video).size
    if (videos.length > 1) item.warnings.push(`Có ${videos.length} file video, tool dùng "${videos[0]}".`)
  }

  const images = files.filter((f) => IMAGE_EXT.includes(ext(f)))
  const thumb = images.find((f) => /^(thumbnail|thumb|anh[-_ ]?bia|bia|cover)\./i.test(f)) || (images.length === 1 ? images[0] : null)
  if (thumb) {
    item.thumbnail = path.join(folder, thumb)
    if (fs.statSync(item.thumbnail).size > THUMB_MAX) item.errors.push(`Ảnh thumbnail "${thumb}" lớn hơn 2 MB, YouTube sẽ từ chối.`)
  } else if (images.length > 1) item.warnings.push('Có nhiều ảnh nhưng không có ảnh tên "thumbnail", nên chưa chọn thumbnail.')

  for (const f of files.filter((x) => SUB_EXT.includes(ext(x)))) {
    const parts = f.split('.')
    const lang = parts.length >= 3 && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(parts[parts.length - 2]) ? parts[parts.length - 2] : ''
    item.subtitles.push({ file: path.join(folder, f), lang })
  }

  const infoFile = files.find((f) => /^(info|thong[-_ ]?tin|mo[-_ ]?ta)\.txt$/i.test(f))
  if (infoFile) {
    const { info, warnings } = parseInfo(fs.readFileSync(path.join(folder, infoFile), 'utf8'))
    item.info = info
    item.warnings.push(...warnings)
  }
  return item
}

function scanPost(root, dir) {
  const folder = path.join(root, dir)
  const files = listFiles(folder)
  const { date, time, name } = parseFolderName(dir)
  const item = { kind: 'post', id: `posts/${dir}`, dir, folder, date, time, name, text: '', images: [], errors: [], warnings: [] }
  const txt = files.find((f) => /^(noi[-_ ]?dung|post|bai[-_ ]?viet)\.txt$/i.test(f)) || files.find((f) => ext(f) === '.txt')
  if (txt) item.text = fs.readFileSync(path.join(folder, txt), 'utf8').replace(/^﻿/, '').trim()
  item.images = files.filter((f) => IMAGE_EXT.includes(ext(f)) || ext(f) === '.gif' || ext(f) === '.webp').map((f) => path.join(folder, f))
  if (!item.text && !item.images.length) item.errors.push('Thư mục trống: cần noidung.txt hoặc ảnh.')
  if (item.images.length > POST_IMAGES_MAX) item.errors.push(`Có ${item.images.length} ảnh, bài cộng đồng chỉ cho tối đa ${POST_IMAGES_MAX}.`)
  return item
}

// Tra ve { root, videos, posts, errors }
function scan(root) {
  const out = { root, videos: [], posts: [], errors: [], at: new Date().toISOString() }
  if (!root) { out.errors.push('Chưa chọn thư mục gốc.'); return out }
  if (!fs.existsSync(root)) { out.errors.push(`Không tìm thấy thư mục: ${root}`); return out }
  const vRoot = path.join(root, DIRS.videos)
  const pRoot = path.join(root, DIRS.posts)
  if (!fs.existsSync(vRoot) && !fs.existsSync(pRoot)) out.errors.push(`Thư mục gốc chưa có thư mục con "${DIRS.videos}" hoặc "${DIRS.posts}".`)
  for (const d of listDirs(vRoot)) {
    try { out.videos.push(scanVideo(vRoot, d)) } catch (e) { out.errors.push(`${DIRS.videos}/${d}: ${e.message}`) }
  }
  for (const d of listDirs(pRoot)) {
    try { out.posts.push(scanPost(pRoot, d)) } catch (e) { out.errors.push(`${DIRS.posts}/${d}: ${e.message}`) }
  }
  return out
}

// Tao san cau truc thu muc mau cho nguoi dung moi.
function createSkeleton(root) {
  for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(root, d), { recursive: true })
  const readme = path.join(root, 'HUONG-DAN.txt')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      'Mỗi video là một thư mục con trong "videos", ví dụ: videos/2026-10-28_ten-video/',
      '  video.mp4      (bắt buộc)',
      '  thumbnail.jpg  (tùy chọn, 1280x720, dưới 2 MB)',
      '  info.txt       (tùy chọn, bỏ trống thì dùng mẫu mặc định)',
      '  phude.vi.srt   (tùy chọn)',
      '',
      'Ví dụ info.txt:',
      '  Tiêu đề: Tên video {so_tap}',
      '  Thẻ: thẻ 1, thẻ 2',
      '  Giờ đăng: 2026-10-28 19:00',
      '  Hiển thị: công khai',
      '  ---',
      '  Phần mô tả viết từ đây, nhiều dòng cũng được.',
      '',
      'Mỗi bài cộng đồng là một thư mục con trong "posts": noidung.txt + ảnh (tối đa 10).',
      'Tên thư mục bắt đầu bằng ngày (2026-10-28_...) để tool tự xếp lịch.',
      '',
    ].join('\r\n'))
  }
}

module.exports = { VIDEO_EXT, IMAGE_EXT, DIRS, parseWhen, parseInfo, parseFolderName, scan, scanVideo, scanPost, createSkeleton }
