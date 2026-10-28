// Quet thu muc goc cua nguoi dung thanh hang doi:
//   <goc>/videos/<2026-10-28_ten-video>/ video.mp4, thumbnail.jpg, info.txt, phude.vi.srt
//   <goc>/posts/<2026-10-29_bai-1>/      noidung.txt, anh1.jpg ...
//   <goc>/da-dang/                       thu muc da xong duoc chuyen vao day
const fs = require('fs')
const path = require('path')

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv', '.flv', '.mpeg', '.mpg', '.3gp']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png']
const SUB_EXT = ['.srt', '.vtt']
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

// ---- thu muc video "phang" (mac dinh tu 0.5.1) -------------------------------------------
// Nguoi dung chon MOT thu muc: moi video la mot file, anh thumbnail cung ten ("Ten video.mp4" + "Ten video.jpg|jpeg|png|webp").
// Tieu de = ten file (bo duoi). Tuy chon: "Ten video.vi.srt" / "Ten video.srt" (phu de), "Ten video.txt" (dang info.txt:
// mo ta Gemini viet, the...). Video da dang chuyen vao <thu muc>/da-dang/.
// Van doc kieu cu (re): thu muc con co file video = mot video (scanVideo); thu muc "videos/" ben trong = thu muc goc kieu cu.
const THUMB_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const SKIP_DIRS = new Set([DIRS.done, DIRS.posts])
const baseOf = (f) => f.slice(0, f.length - path.extname(f).length)
const same = (a, b) => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase()

function scanFlat(dir, files) {
  const out = []
  const seen = new Map()
  for (const f of files.filter((x) => VIDEO_EXT.includes(ext(x)))) {
    const base = baseOf(f)
    const video = path.join(dir, f)
    const item = {
      kind: 'video', layout: 'flat', id: `tep/${f}`, dir: base, folder: dir, key: video, name: base, titleFromName: true,
      date: null, time: null, episode: (/(?:tap|tập|ep)[\s_-]*(\d+)/i.exec(base) || [])[1] || '',
      video, size: fs.statSync(video).size, thumbnail: null, subtitles: [], info: { vars: {} }, infoFile: path.join(dir, `${base}.txt`), files: [video], errors: [], warnings: [],
    }
    const twin = [...seen.keys()].find((b) => same(b, base))
    if (twin) item.errors.push(`Trùng tên với "${seen.get(twin)}": mỗi video cần một tên riêng (đổi tên một file).`)
    else seen.set(base, f)
    const thumbs = files.filter((x) => THUMB_EXT.includes(ext(x)) && same(baseOf(x), base)).sort((a, b) => THUMB_EXT.indexOf(ext(a)) - THUMB_EXT.indexOf(ext(b)))
    if (thumbs.length) {
      item.thumbnail = path.join(dir, thumbs[0])
      item.files.push(item.thumbnail)
      if (thumbs.length > 1) item.warnings.push(`Có ${thumbs.length} ảnh cùng tên, tool dùng "${thumbs[0]}".`)
    } else item.warnings.push(`Chưa có ảnh thumbnail cùng tên ("${base}.jpg", .jpeg, .png hoặc .webp): YouTube tự chọn ảnh từ video.`)
    for (const s of files.filter((x) => SUB_EXT.includes(ext(x)))) {
      const b = baseOf(s)
      const lang = same(b, base) ? '' : same(b.slice(0, base.length), base) && /^\.[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(b.slice(base.length)) ? b.slice(base.length + 1) : null
      if (lang === null) continue
      item.subtitles.push({ file: path.join(dir, s), lang })
      item.files.push(path.join(dir, s))
    }
    const txt = files.find((x) => ext(x) === '.txt' && same(baseOf(x), base))
    if (txt) {
      item.infoFile = path.join(dir, txt)
      item.files.push(item.infoFile)
      const { info, warnings } = parseInfo(fs.readFileSync(item.infoFile, 'utf8'))
      item.info = info
      item.warnings.push(...warnings.map((w) => w.replace(/^info\.txt/, txt)))
    }
    out.push(item)
  }
  return out
}

// Tra ve { dir, videos, errors }. Moi video co doneDir (noi chuyen vao sau khi dang).
function scanVideos(dir) {
  const out = { dir, videos: [], errors: [], at: new Date().toISOString() }
  if (!dir) { out.errors.push('Chưa chọn thư mục video.'); return out }
  if (!fs.existsSync(dir)) { out.errors.push(`Không tìm thấy thư mục: ${dir}`); return out }
  const doneDir = path.join(dir, DIRS.done)
  const add = (it) => { it.doneDir = doneDir; out.videos.push(it) }
  const walk = (d, prefix, depth) => {
    let files
    try { files = listFiles(d) } catch (e) { out.errors.push(`${d}: ${e.message}`); return }
    for (const it of scanFlat(d, files)) { if (prefix) it.id = `${prefix}/${it.id}`; add(it) }
    for (const sub of listDirs(d)) {
      if (SKIP_DIRS.has(sub.toLowerCase())) continue
      // thu muc goc kieu cu: <goc>/videos/<thu muc video>/...
      if (depth === 0 && sub.toLowerCase() === DIRS.videos) { walk(path.join(d, sub), DIRS.videos, 1); continue }
      const folder = path.join(d, sub)
      let has = false
      try { has = listFiles(folder).some((f) => VIDEO_EXT.includes(ext(f))) } catch (_) { /* bo */ }
      // thu muc khac (anh, nhap...) trong thu muc video: bo qua; trong videos/ kieu cu: van bao "khong co file video"
      if (!has && !prefix) continue
      try {
        const it = scanVideo(d, sub)
        it.layout = 'folder'
        it.key = it.folder
        it.id = prefix ? `${prefix}/${sub}` : `thu-muc/${sub}`
        add(it)
      } catch (e) { out.errors.push(`${sub}: ${e.message}`) }
    }
  }
  walk(dir, '', 0)
  return out
}

// ---- bai dang (posts) ------------------------------------------------------------------
// Loai bai: text | image | poll | image_poll | quiz | video (mot bai chi gan duoc mot loai)
const POST_TYPES = {
  van_ban: 'text', chu: 'text', text: 'text',
  anh: 'image', hinh_anh: 'image', image: 'image', images: 'image',
  tham_do: 'poll', tham_do_van_ban: 'poll', binh_chon: 'poll', poll: 'poll', text_poll: 'poll',
  tham_do_anh: 'image_poll', tham_do_hinh_anh: 'image_poll', binh_chon_anh: 'image_poll', image_poll: 'image_poll',
  do_vui: 'quiz', cau_do: 'quiz', cau_hoi: 'quiz', quiz: 'quiz',
  video: 'video', chia_se_video: 'video',
}
const POST_TYPE_LABEL = { text: 'văn bản', image: 'ảnh', poll: 'thăm dò', image_poll: 'thăm dò ảnh', quiz: 'đố vui', video: 'video' }
const POST_KEYS = { loai: 'loai', type: 'loai', gio_dang: 'gio_dang', lich: 'gio_dang', video: 'video', kenh: 'kenh', channel: 'kenh', hien_thi: 'hien_thi' }
const POST_IMAGE_EXT = [...IMAGE_EXT, '.gif', '.webp']
const POLL = { min: 2, max: 4, textMax: 65, imageMax: 36 }
const QUIZ = { min: 2, max: 4 }
const RATIO = { min: 2 / 5, max: 5 / 2 }
const SIDE_FILES = /^(binh[-_ ]?chon|cau[-_ ]?hoi|ket[-_ ]?qua|huong[-_ ]?dan)\.txt$/i

// "https://youtu.be/ID" | "...watch?v=ID" | "/shorts/ID" | "ID" -> ID (11 ky tu) hoac ''
function videoId(s) {
  s = String(s || '').trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:shorts|live|embed|v)\/)([\w-]{11})(?![\w-])/.exec(s)
  return m ? m[1] : ''
}

// Kich thuoc anh tu phan dau file (PNG, GIF, JPEG, WebP). Khong doc duoc -> null.
function imageSize(file) {
  let b
  try {
    const fd = fs.openSync(file, 'r')
    b = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 256 * 1024))
    fs.readSync(fd, b, 0, b.length, 0)
    fs.closeSync(fd)
  } catch (_) { return null }
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  if (b.length >= 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) } }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  return null
}

// noidung.txt: "Khoa: gia tri" (Loai, Gio dang, Video, Kenh, Hien thi) + "---" + than bai.
// Khong co "---": chi nhan cac dong dau la khoa hop le, phan con lai la than bai.
function parsePostText(text) {
  const head = {}
  const warnings = []
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/)
  const parseLine = (line) => {
    const m = /^\s*([^:#][^:]{0,20}):\s*(.*)$/.exec(line)
    const field = m && POST_KEYS[key(m[1])]
    return field ? { field, v: m[2].replace(/\s+#\s.*$/, '').trim() } : null
  }
  const sep = lines.findIndex((l) => /^\s*-{3,}\s*$/.test(l))
  const before = sep > 0 ? lines.slice(0, sep).filter((l) => l.trim() && !/^\s*#/.test(l)) : null
  let bodyStart = 0
  if (before && before.length && before.every(parseLine)) {
    for (const l of before) { const p = parseLine(l); head[p.field] = p.v }
    bodyStart = sep + 1
  } else {
    // khong co "---": nhan dong dau neu gia tri hop le (tranh nham "Video: tap moi ra lo")
    for (; bodyStart < lines.length; bodyStart++) {
      const p = parseLine(lines[bodyStart])
      const ok = p && (p.field === 'loai' ? POST_TYPES[key(p.v)] : p.field === 'gio_dang' ? parseWhen(p.v) : p.field === 'video' ? videoId(p.v) : p.v)
      if (!ok) break
      head[p.field] = p.v
    }
  }
  const out = { body: lines.slice(bodyStart).join('\n').trim(), type: '', when: undefined, video: '', channel: '' }
  if (head.loai !== undefined && head.loai !== '') {
    out.type = POST_TYPES[key(head.loai)] || ''
    if (!out.type) warnings.push(`noidung.txt: không hiểu loại bài "${head.loai}" (văn bản / ảnh / thăm dò / thăm dò ảnh / đố vui / video), tool tự đoán loại.`)
  }
  if (head.gio_dang !== undefined) {
    if (!head.gio_dang) out.when = null // de trong = dang ngay
    else if (parseWhen(head.gio_dang)) out.when = parseWhen(head.gio_dang)
    else warnings.push(`noidung.txt: không hiểu giờ đăng "${head.gio_dang}" (viết dạng 2026-10-30 08:00).`)
  }
  if (head.video !== undefined) out.video = head.video
  if (head.kenh) out.channel = head.kenh.replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
  return { ...out, warnings }
}

// Mot dong lua chon: "Bia C" | "anh3.jpg | Bia C" | "Da-vit | 3.jpg"
function splitOption(line) {
  const parts = line.split('|').map((x) => x.trim())
  if (parts.length < 2) return { text: line.trim(), image: '' }
  const isImg = (s) => POST_IMAGE_EXT.includes(ext(s))
  if (isImg(parts[0]) && !isImg(parts[1])) return { text: parts.slice(1).join(' | '), image: parts[0] }
  if (isImg(parts[parts.length - 1])) return { text: parts.slice(0, -1).join(' | '), image: parts[parts.length - 1] }
  return { text: line.trim(), image: '' }
}
// bo dong trong, dong "#..." va chu thich cuoi dong "   # ..." (it nhat 2 dau cach truoc #)
const optionLines = (text) => String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.replace(/\s{2,}#\s.*$/, '').trim()).filter((l) => l && !l.startsWith('#'))

function scanPost(root, dir) {
  const folder = path.join(root, dir)
  const files = listFiles(folder)
  const { date, time, name } = parseFolderName(dir)
  const item = {
    kind: 'post', id: `posts/${dir}`, dir, folder, date, time, name, text: '', images: [], type: 'text', when: null, channel: '', video: '',
    options: [], answers: [], explanation: '', errors: [], warnings: [],
  }
  const find = (re) => files.find((f) => re.test(f))
  const txt = find(/^(noi[-_ ]?dung|post|bai[-_ ]?viet)\.txt$/i) || files.find((f) => ext(f) === '.txt' && !SIDE_FILES.test(f))
  const pollFile = find(/^binh[-_ ]?chon\.txt$/i)
  const quizFile = find(/^cau[-_ ]?hoi\.txt$/i)
  const head = parsePostText(txt ? fs.readFileSync(path.join(folder, txt), 'utf8') : '')
  item.text = head.body
  item.channel = head.channel
  item.warnings.push(...head.warnings)
  item.images = files.filter((f) => POST_IMAGE_EXT.includes(ext(f))).map((f) => path.join(folder, f))
  const imgNames = item.images.map((f) => path.basename(f))

  // loai bai: theo "Loai:", khong co thi tu doan
  const hasVideo = head.video !== ''
  const kinds = [hasVideo && 'Video:', pollFile && pollFile, quizFile && quizFile].filter(Boolean)
  if (kinds.length > 1) item.errors.push(`Một bài chỉ gắn được một loại, nhưng thư mục có cả ${kinds.join(' và ')}.`)
  const guess = hasVideo ? 'video' : quizFile ? 'quiz' : pollFile ? (item.images.length ? 'image_poll' : 'poll') : item.images.length ? 'image' : 'text'
  item.type = head.type || guess

  // gio dang: "Gio dang:" > ten thu muc (ngay + gio); chi co ngay = dang ngay
  let when = head.when !== undefined ? head.when : date && time ? parseWhen(`${date} ${time}`) : null
  if (when && when.getTime() <= Date.now()) {
    item.warnings.push(`Giờ đăng ${when.toLocaleString('vi-VN')} đã qua, tool sẽ đăng ngay.`)
    when = null
  }
  // o chon gio cua YouTube chi co cac moc 15 phut: lam tron len
  if (when && (when.getMinutes() % 15 || when.getSeconds())) {
    const r = new Date(when)
    r.setSeconds(0, 0)
    r.setMinutes(Math.ceil(when.getMinutes() / 15) * 15)
    item.warnings.push(`YouTube chỉ cho chọn giờ theo mốc 15 phút: ${when.toTimeString().slice(0, 5)} được làm tròn thành ${r.toTimeString().slice(0, 5)}.`)
    when = r
  }
  item.when = when ? when.toISOString() : null

  const fileOf = (n) => { const f = imgNames.find((x) => x.toLowerCase() === n.toLowerCase()); return f ? path.join(folder, f) : '' }
  const used = new Set()
  const t = item.type
  if (t === 'video') {
    item.video = videoId(head.video)
    if (!item.video) item.errors.push(head.video ? `Không hiểu video "${head.video}": cần URL YouTube hoặc mã 11 ký tự.` : 'Bài chia sẻ video cần dòng "Video: <URL>" trong noidung.txt.')
    if (item.images.length) item.errors.push('Bài chia sẻ video không gắn kèm ảnh được, hãy bỏ ảnh ra khỏi thư mục.')
  } else if (t === 'poll' || t === 'image_poll') {
    if (!pollFile) item.errors.push(`Bài ${POST_TYPE_LABEL[t]} cần file binhchon.txt (mỗi dòng một lựa chọn).`)
    else {
      item.options = optionLines(fs.readFileSync(path.join(folder, pollFile), 'utf8')).map(splitOption)
      const max = t === 'poll' ? POLL.textMax : POLL.imageMax
      if (item.options.length < POLL.min) item.errors.push(`Thăm dò cần ít nhất ${POLL.min} lựa chọn (binhchon.txt có ${item.options.length}).`)
      if (t === 'poll' && item.options.length > POLL.max) item.errors.push(`Thăm dò văn bản chỉ cho tối đa ${POLL.max} lựa chọn (binhchon.txt có ${item.options.length}).`)
      if (t === 'image_poll' && item.options.length > POLL.max) item.warnings.push(`Có ${item.options.length} lựa chọn, chưa rõ thăm dò ảnh cho tối đa bao nhiêu (đã thấy ${POLL.max}).`)
      item.options.forEach((o, i) => {
        if ([...o.text].length > max) item.errors.push(`Lựa chọn ${i + 1} dài ${[...o.text].length} ký tự, tối đa ${max}.`)
      })
    }
    if (t === 'image_poll') {
      // anh: "anh3.jpg | ..." > so dau ten file (1.jpg -> dong 1) > lan luot cac anh con lai
      for (const o of item.options) if (o.image) { const f = fileOf(o.image); if (!f) item.errors.push(`Không thấy ảnh "${o.image}" trong thư mục.`); o.image = f; if (f) used.add(f) }
      item.options.forEach((o, i) => {
        if (o.image) return
        const f = item.images.find((x) => !used.has(x) && Number((/^(\d+)/.exec(path.basename(x)) || [])[1]) === i + 1)
        if (f) { o.image = f; used.add(f) }
      })
      const free = item.images.filter((x) => !used.has(x) && !/^\d+/.test(path.basename(x)))
      for (const o of item.options) if (!o.image && free.length) { o.image = free.shift(); used.add(o.image) }
      item.options.forEach((o, i) => { if (!o.image) item.warnings.push(`Lựa chọn ${i + 1} ("${o.text}") chưa có ảnh.`) })
    } else {
      for (const o of item.options) if (o.image) item.warnings.push(`Thăm dò văn bản không có ảnh, bỏ qua "${o.image}".`)
      item.options = item.options.map((o) => ({ text: o.text, image: '' }))
    }
  } else if (t === 'quiz') {
    if (!quizFile) item.errors.push('Bài đố vui cần file cauhoi.txt (mỗi dòng một câu trả lời, dấu * trước câu đúng).')
    else {
      for (const line of optionLines(fs.readFileSync(path.join(folder, quizFile), 'utf8'))) {
        const ex = /^(giải thích|giai thich|explanation)\s*:\s*(.*)$/i.exec(line)
        if (ex) { item.explanation = ex[2].trim(); continue }
        const correct = /^\*/.test(line)
        const o = splitOption(line.replace(/^\*\s*/, ''))
        if (o.image) { const f = fileOf(o.image); if (!f) item.errors.push(`Không thấy ảnh "${o.image}" trong thư mục.`); o.image = f; if (f) used.add(f) }
        item.answers.push({ ...o, correct })
      }
      const n = item.answers.length
      if (n < QUIZ.min || n > QUIZ.max) item.errors.push(`Đố vui cần ${QUIZ.min}–${QUIZ.max} câu trả lời (cauhoi.txt có ${n}).`)
      const right = item.answers.filter((a) => a.correct).length
      if (right !== 1) item.errors.push(right ? `cauhoi.txt có ${right} câu đánh dấu *, chỉ được một câu đúng.` : 'cauhoi.txt chưa đánh dấu * trước câu trả lời đúng.')
    }
  } else if (t === 'image') {
    if (!item.images.length) item.errors.push('Loại "ảnh" nhưng thư mục không có ảnh.')
  }
  if (t === 'image' || t === 'image_poll' || t === 'quiz') {
    for (const f of t === 'image' ? item.images : [...used]) {
      const s = imageSize(f)
      if (s && s.h && (s.w / s.h < RATIO.min || s.w / s.h > RATIO.max)) item.warnings.push(`Ảnh "${path.basename(f)}" (${s.w}x${s.h}) ngoài tỷ lệ 2:5 đến 5:2, YouTube có thể từ chối.`)
    }
  }
  if (t !== 'image') {
    const unused = item.images.filter((f) => !used.has(f))
    if (unused.length && t !== 'video') item.warnings.push(`Bài ${POST_TYPE_LABEL[t]} không dùng ${unused.length} ảnh: ${unused.map((f) => path.basename(f)).join(', ')}.`)
  }
  if ((t === 'poll' || t === 'image_poll' || t === 'quiz') && !item.text) item.warnings.push('Chưa có câu hỏi: viết câu hỏi vào noidung.txt.')
  if (t === 'text' && !item.text) item.errors.push(item.images.length ? 'Không có chữ để đăng.' : 'Thư mục trống: cần noidung.txt hoặc ảnh.')
  if (item.images.length > POST_IMAGES_MAX && t === 'image') item.errors.push(`Có ${item.images.length} ảnh, bài cộng đồng chỉ cho tối đa ${POST_IMAGES_MAX}.`)
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
      'Video: chọn thư mục video ở trang Đăng video (hoặc bỏ video vào thư mục "videos" này).',
      'Mỗi video là một file, ảnh thumbnail CÙNG TÊN nằm cạnh, ví dụ:',
      '  Bí ẩn rừng sâu tập 1.mp4',
      '  Bí ẩn rừng sâu tập 1.jpg      (hoặc .jpeg / .png / .webp)',
      '  Bí ẩn rừng sâu tập 1.vi.srt   (tùy chọn: phụ đề)',
      '  Bí ẩn rừng sâu tập 1.txt      (tùy chọn: mô tả riêng, viết như info.txt bên dưới)',
      'Tiêu đề = tên file. Mô tả, thẻ, danh sách phát, chế độ hiển thị, lịch đăng: theo mẫu mặc định.',
      'Video đã đăng được chuyển vào "da-dang" (kèm file .ket-qua.txt), lần sau không đăng lại.',
      '',
      'Ví dụ file .txt riêng của video (hoặc info.txt trong thư mục con kiểu cũ):',
      '  Tiêu đề: Tên video {so_tap}',
      '  Thẻ: thẻ 1, thẻ 2',
      '  Giờ đăng: 2026-10-28 19:00',
      '  Hiển thị: công khai',
      '  ---',
      '  Phần mô tả viết từ đây, nhiều dòng cũng được.',
      '',
      'Mỗi bài đăng là một thư mục con trong "posts", ví dụ: posts/2026-10-29_19h00_bai-anh/',
      '  Có giờ trong tên thư mục (19h00) = lên lịch đăng; chỉ có ngày = đăng ngay.',
      '  noidung.txt    chữ của bài (với thăm dò, đố vui: đây là câu hỏi)',
      '  1.jpg 2.png    ảnh (tối đa 10, tỷ lệ từ 2:5 đến 5:2)',
      '  binhchon.txt   thăm dò: mỗi dòng một lựa chọn (2-4 dòng, tối đa 65 ký tự;',
      '                 có ảnh = thăm dò ảnh, tối đa 36 ký tự, ảnh 1.jpg cho dòng 1...)',
      '  cauhoi.txt     đố vui: mỗi dòng một câu trả lời (2-4), dấu * trước câu đúng,',
      '                 "Đáp án | 3.jpg" để gắn ảnh, dòng "Giải thích: ..." (tùy chọn)',
      '',
      'Phần đầu noidung.txt (tùy chọn), ngăn với nội dung bằng dòng ---:',
      '  Loại: thăm dò ảnh        (văn bản / ảnh / thăm dò / thăm dò ảnh / đố vui / video)',
      '  Giờ đăng: 2026-10-30 08:00',
      '  Video: https://youtu.be/xxxxxxxxxxx   (bài chia sẻ video)',
      '  Kênh: @tenkenh          (bỏ trống = kênh chọn trong tool)',
      '  ---',
      '  Bạn thích bìa nào cho tập tiếp theo?',
      '',
      'Bài đã đăng được chuyển vào "da-dang" kèm file ket-qua.txt.',
      '',
    ].join('\r\n'))
  }
}

module.exports = { VIDEO_EXT, IMAGE_EXT, THUMB_EXT, DIRS, POST_TYPE_LABEL, POST_IMAGES_MAX, parseWhen, parseInfo, parseFolderName, parsePostText, videoId, imageSize, scan, scanVideo, scanVideos, scanPost, createSkeleton }
