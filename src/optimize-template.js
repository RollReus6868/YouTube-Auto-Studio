// Mau "toi uu video da dang" (theo video quay "toi uu video - mau mac dinh"): moi kenh mot
// mau, them mot mau mac dinh. Chi gom ham thuan (khong Electron) de kiem thu bang node.
// Gia tri 'keep' (hoac chuoi rong) = "giu nguyen": tool khong dung toi muc do trong Studio.

// Danh muc va ngon ngu hien trong Studio tieng Viet (chon theo dung chu nay).
const CATEGORY_NAMES = {
  1: 'Phim và hoạt hình', 2: 'Ô tô và xe cộ', 10: 'Âm nhạc', 15: 'Thú cưng và động vật', 17: 'Thể thao',
  19: 'Du lịch và sự kiện', 20: 'Trò chơi', 22: 'Mọi người và blog', 23: 'Hài kịch', 24: 'Giải trí',
  25: 'Tin tức và chính trị', 26: 'Hướng dẫn và phong cách', 27: 'Giáo dục', 28: 'Khoa học và công nghệ',
  29: 'Tổ chức phi lợi nhuận và hoạt động xã hội',
}
const STUDIO_LANGUAGES = [
  'Tiếng Việt', 'Tiếng Anh', 'Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Vương quốc Anh)', 'Tiếng Tây Ban Nha', 'Tiếng Pháp',
  'Tiếng Bồ Đào Nha (Brazil)', 'Tiếng Đức', 'Tiếng Nhật', 'Tiếng Hàn', 'Tiếng Trung (Giản thể)', 'Tiếng Thái', 'Tiếng Hindi', 'Tiếng Indonesia',
]

const ONE_OF = {
  paidPromotion: ['keep', 'yes', 'no'],
  ai: ['keep', 'yes', 'no'],
  tagsMode: ['keep', 'title'], // title: giu the cu + them tieu de video lam the
  recordingDate: ['keep', 'today', 'publish'],
  license: ['keep', 'youtube', 'creativeCommon'],
  embeddable: ['keep', 'yes', 'no'],
  remix: ['keep', 'all', 'audio', 'none'],
  comments: ['keep', 'on', 'pause', 'off'],
  endScreen: ['keep', 'latest'],
}

// Dung nhu video quay: 2 danh sach phat, khong quang cao tra tien, AI = Co, them tieu de lam the,
// United States, ngay quay = hom nay, khong cho phoi lai, man hinh ket thuc cua video gan nhat,
// cac muc khac giu nguyen; sau khi luu: Like, binh luan = tieu de, ghim.
function defaultTemplate() {
  return {
    playlists: [],
    paidPromotion: 'no',
    ai: 'yes',
    tagsMode: 'title',
    extraTags: [],
    location: 'United States',
    recordingDate: 'today',
    remix: 'none',
    endScreen: 'latest',
    category: 'keep', // 'keep' | id danh muc ('22')
    language: '', // '' = giu nguyen | ten ngon ngu trong Studio
    comments: 'keep',
    license: 'keep',
    embeddable: 'keep',
    like: true,
    description: '', // '' = khong dung; co chu = dien vao video CHUA co mo ta (co roi thi giu nguyen)
    comment: '{tieu_de}', // '' = khong binh luan
    pin: true,
  }
}

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean)

function normalizeTemplate(t) {
  const d = defaultTemplate()
  const src = t && typeof t === 'object' ? t : {}
  const out = { ...d }
  for (const [k, ok] of Object.entries(ONE_OF)) if (ok.includes(src[k])) out[k] = src[k]
  // ten danh sach phat: bo trung (cung ten -> tool tich moi danh sach trung ten)
  out.playlists = [...new Set(list(src.playlists !== undefined ? src.playlists : d.playlists))]
  out.extraTags = [...new Set(list(src.extraTags))]
  if (typeof src.location === 'string') out.location = src.location.trim()
  out.category = src.category === 'keep' || CATEGORY_NAMES[src.category] ? String(src.category) : d.category
  if (typeof src.language === 'string') out.language = src.language.trim()
  for (const k of ['like', 'pin']) if (typeof src[k] === 'boolean') out[k] = src[k]
  if (typeof src.description === 'string') out.description = src.description.replace(/\r\n/g, '\n').trim().slice(0, 5000)
  if (typeof src.comment === 'string') out.comment = src.comment.replace(/\r\n/g, '\n').trim().slice(0, 10000)
  return out
}

// Mau cho kenh: mau rieng cua kenh, khong co thi mau mac dinh.
function templateFor(templates, key) {
  const all = templates || {}
  return normalizeTemplate((key && all[key]) || all.default)
}

// Luu mau cho kenh (key) hoac mau mac dinh ('default'). t = null: kenh quay ve dung mau mac dinh.
function setTemplate(templates, key, t) {
  const out = { ...(templates || {}) }
  const k = key || 'default'
  if (t === null && k !== 'default') delete out[k]
  else out[k] = normalizeTemplate(t)
  if (!out.default) out.default = defaultTemplate()
  return out
}

// {bien} -> gia tri; bien khong biet giu nguyen (giong src/metadata.js)
function renderComment(tpl, vars) {
  return String(tpl || '')
    .replace(/\{([\p{L}\w]+)\}/gu, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const COMMENT_VARS = ['{tieu_de}', '{link}', '{ten_kenh}']

// The can them: tieu de (dau phay bi Studio tach thanh nhieu the -> doi thanh dau cach) + the them,
// bo the da co (khong phan biet hoa thuong) va dung trong gioi han 500 ky tu cua YouTube.
function tagLength(tags) {
  return tags.reduce((n, t) => n + [...t].length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1)
}
function tagsToAdd(existing, template, title) {
  const t = normalizeTemplate(template)
  const want = []
  if (t.tagsMode === 'title' && title) want.push(String(title).replace(/,/g, ' ').replace(/\s+/g, ' ').trim())
  want.push(...t.extraTags.map((x) => x.replace(/,/g, ' ')))
  const have = list(existing)
  const seen = new Set(have.map((x) => x.toLowerCase()))
  const add = []
  const skipped = []
  for (const tag of want) {
    if (!tag || seen.has(tag.toLowerCase())) continue
    if (tagLength([...have, ...add, tag]) > 500) { skipped.push(tag); continue }
    seen.add(tag.toLowerCase())
    add.push(tag)
  }
  return { add, skipped }
}

// Ngay kieu Studio tieng Viet: "26 thg 10, 2026"
const fmtStudioDate = (d) => `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}`
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// "25 thg 10, 2026" | "Oct 25, 2026" | "25/10/2026" -> Date (gio dia phuong) hoac null
function parseStudioDate(s) {
  s = String(s || '').trim()
  let m = /(\d{1,2})\s*(?:thg|tháng)\s*(\d{1,2}),?\s*(\d{4})/i.exec(s)
  let day, mon, year
  if (m) [day, mon, year] = [+m[1], +m[2], +m[3]]
  else if ((m = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/.exec(s)) && MONTHS_EN.includes(m[1].toLowerCase())) {
    [day, mon, year] = [+m[2], MONTHS_EN.indexOf(m[1].toLowerCase()) + 1, +m[3]]
  } else if ((m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) [day, mon, year] = [+m[1], +m[2], +m[3]]
  else return null
  const d = new Date(year, mon - 1, day)
  return d.getMonth() === mon - 1 && d.getDate() === day ? d : null
}

// Ngay quay can dat (Date) hoac null = giu nguyen. video.date: ngay trong danh sach Noi dung.
function recordingDateFor(template, video, now = new Date()) {
  const t = normalizeTemplate(template)
  if (t.recordingDate === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (t.recordingDate === 'publish') return parseStudioDate(video && video.date) || null
  return null
}

// Cac muc mau se dung toi (de hien tom tat va kiem thu "giu nguyen").
function touchedFields(template) {
  const t = normalizeTemplate(template)
  const out = []
  if (t.playlists.length) out.push('playlists')
  for (const k of ['paidPromotion', 'ai', 'remix', 'endScreen', 'recordingDate', 'license', 'embeddable', 'comments', 'category']) if (t[k] !== 'keep') out.push(k)
  if (t.tagsMode !== 'keep' || t.extraTags.length) out.push('tags')
  if (t.location) out.push('location')
  if (t.language) out.push('language')
  if (t.like) out.push('like')
  if (t.description) out.push('description')
  if (t.comment) out.push('comment')
  return out
}

// ---- optimized.json: { [channelKey]: { [videoId]: { at, title, pinned, warnings } } } ----
function markOptimized(db, channelKey, videoId, info = {}) {
  const out = { ...(db || {}) }
  out[channelKey] = { ...(out[channelKey] || {}), [videoId]: { at: new Date().toISOString(), ...info } }
  return out
}
const isOptimized = (db, channelKey, videoId) => !!(db && db[channelKey] && db[channelKey][videoId])

module.exports = {
  CATEGORY_NAMES, STUDIO_LANGUAGES, COMMENT_VARS, defaultTemplate, normalizeTemplate, templateFor, setTemplate,
  renderComment, tagsToAdd, tagLength, fmtStudioDate, parseStudioDate, recordingDateFor, touchedFields, markOptimized, isOptimized,
}
