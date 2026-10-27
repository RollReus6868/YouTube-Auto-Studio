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

// Ten tieng Anh (Studio giao dien tieng Anh) cho cung cac muc tren.
const CATEGORY_NAMES_EN = {
  1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports',
  19: 'Travel & Events', 20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment',
  25: 'News & Politics', 26: 'Howto & Style', 27: 'Education', 28: 'Science & Technology',
  29: 'Nonprofits & Activism',
}
const LANGUAGE_EN = {
  'Tiếng Việt': 'Vietnamese', 'Tiếng Anh': 'English', 'Tiếng Anh (Hoa Kỳ)': 'English (United States)',
  'Tiếng Anh (Vương quốc Anh)': 'English (United Kingdom)', 'Tiếng Tây Ban Nha': 'Spanish', 'Tiếng Pháp': 'French',
  'Tiếng Bồ Đào Nha (Brazil)': 'Portuguese (Brazil)', 'Tiếng Đức': 'German', 'Tiếng Nhật': 'Japanese', 'Tiếng Hàn': 'Korean',
  'Tiếng Trung (Giản thể)': 'Chinese (Simplified)', 'Tiếng Thái': 'Thai', 'Tiếng Hindi': 'Hindi', 'Tiếng Indonesia': 'Indonesian',
}
// Lua chon dang radio / dropdown: [tieng Viet, tieng Anh]
const OPTION_NAMES = {
  license: { youtube: ['Giấy phép chuẩn của YouTube', 'Standard YouTube License'], creativeCommon: ['Creative Commons - Ghi công', 'Creative Commons - Attribution'] },
  comments: { on: ['Bật', 'On'], pause: ['Tạm dừng', 'Pause'], off: ['Tắt', 'Off'] },
}

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
    playlistAuto: 3, // tu tich N danh sach phat dau tien trong hop thoai (0 = tat)
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

const lc = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean)

function normalizeTemplate(t) {
  const d = defaultTemplate()
  const src = t && typeof t === 'object' ? t : {}
  const out = { ...d }
  for (const [k, ok] of Object.entries(ONE_OF)) if (ok.includes(src[k])) out[k] = src[k]
  // ten danh sach phat: bo trung (cung ten -> tool tich moi danh sach trung ten)
  out.playlists = [...new Set(list(src.playlists !== undefined ? src.playlists : d.playlists))]
  out.extraTags = [...new Set(list(src.extraTags))]
  // mau cu chua co playlistAuto -> mac dinh 3 cho moi mau (nguoi dung muon tu chon)
  const n = Number(src.playlistAuto)
  if (src.playlistAuto !== undefined && src.playlistAuto !== '' && Number.isFinite(n)) out.playlistAuto = Math.max(0, Math.min(5, Math.round(n)))
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

// Mau "giu nguyen het" (khong dung toi muc nao, khong thich / binh luan / ghim)
function keepAll() {
  const out = {}
  for (const k of Object.keys(ONE_OF)) out[k] = 'keep'
  return normalizeTemplate({ ...out, playlists: [], playlistAuto: 0, extraTags: [], location: '', category: 'keep', language: '', like: false, description: '', comment: '', pin: false })
}

// Mau toi uu chay SAU khi dang (src/features/optimize.js). Hop thoai tai len cua Studio da dat cac muc cua mau
// (src/flows/upload.js) nen chi con: cac muc chua dat duoc trong hop thoai (missed) va - khi preset bat
// "sau khi dang: tu toi uu" (after) - thich / binh luan / ghim o trang xem video.
// extra: { playlists, tags } cua video (preset / info.txt) de dat lai cung muc danh sach phat / the.
// Khong con gi de lam -> null.
function afterUploadTemplate(template, missed = [], { after = false, playlists = [], tags = [] } = {}) {
  const src = normalizeTemplate(template)
  const out = keepAll()
  for (const k of missed) {
    if (k === 'playlists') { out.playlists = [...new Set([...list(playlists), ...src.playlists])]; out.playlistAuto = src.playlistAuto }
    else if (k === 'tags') { out.tagsMode = src.tagsMode; out.extraTags = [...new Set([...list(tags).map((x) => x.replace(/,/g, ' ')), ...src.extraTags])] }
    else if (['paidPromotion', 'ai', 'recordingDate', 'license', 'embeddable', 'remix', 'comments', 'endScreen', 'category', 'location', 'language'].includes(k)) out[k] = src[k]
  }
  if (after) { out.like = src.like; out.comment = src.comment; out.pin = src.pin }
  const res = normalizeTemplate(out)
  return touchedFields(res).length ? res : null
}

// Video trong hang cho tu toi uu: nguoi dung co the sua preset sau khi dang -> cac muc mau `tpl` dang dat
// (va thich / binh luan / ghim) lay gia tri moi nhat cua preset; danh sach phat / the giu theo video.
function refreshPending(tpl, presetTemplate) {
  const t = normalizeTemplate(tpl)
  if (!presetTemplate) return t
  const p = normalizeTemplate(presetTemplate)
  for (const k of ['paidPromotion', 'ai', 'remix', 'endScreen', 'recordingDate', 'license', 'embeddable', 'comments', 'category']) if (t[k] !== 'keep') t[k] = p[k]
  for (const k of ['location', 'language', 'description']) if (t[k]) t[k] = p[k]
  if (t.like || t.comment || t.pin) { t.like = p.like; t.comment = p.comment; t.pin = p.pin }
  return normalizeTemplate(t)
}

// Preset cu (ban dang qua YouTube Data API) co cac muc nay; hop thoai tai len khong co cho rieng nen chuyen sang
// mau Studio cua preset (preset.optimize) - chi khi khac mac dinh cu va mau dang de "giu nguyen" - roi bo khoi preset.
//   categoryId (mac dinh cu '22' = Moi nguoi va blog, cung la mac dinh cua Studio), language (ma 'vi'/'en'... ;
//   'vi' la mac dinh cu, 'en' trung ngon ngu mac dinh "Tieng Anh (Hoa Ky)" cua kenh -> khong dat lai), license,
//   embeddable, syntheticMedia (true -> AI = Co). publicStatsViewable khong con (Studio khong co o nay luc tai len).
const LANGUAGE_OF_CODE = { vi: 'Tiếng Việt', en: 'Tiếng Anh', ja: 'Tiếng Nhật', ko: 'Tiếng Hàn', zh: 'Tiếng Trung (Giản thể)', th: 'Tiếng Thái', fr: 'Tiếng Pháp', es: 'Tiếng Tây Ban Nha', de: 'Tiếng Đức', pt: 'Tiếng Bồ Đào Nha (Brazil)', hi: 'Tiếng Hindi', id: 'Tiếng Indonesia' }
const API_PRESET_FIELDS = ['categoryId', 'language', 'license', 'embeddable', 'syntheticMedia', 'publicStatsViewable']
function migrateApiPreset(p, optimize) {
  const t = normalizeTemplate(optimize)
  const src = p || {}
  if (src.categoryId !== undefined && String(src.categoryId) !== '22' && CATEGORY_NAMES[src.categoryId] && t.category === 'keep') t.category = String(src.categoryId)
  const code = String(src.language || '').toLowerCase()
  if (code && !['vi', 'en'].includes(code) && LANGUAGE_OF_CODE[code] && !t.language) t.language = LANGUAGE_OF_CODE[code]
  if (src.license === 'creativeCommon' && t.license === 'keep') t.license = 'creativeCommon'
  if (src.embeddable === false && t.embeddable === 'keep') t.embeddable = 'no'
  if (src.syntheticMedia === true && t.ai === 'keep') t.ai = 'yes'
  return t
}

// Mau Studio cho preset cu (chua co preset.optimize): da bat "sau khi dang: toi uu" thi lay mau
// toi uu mac dinh dang luu (giu nguyen cach chay cu), khong thi lay mau goc cua tool.
function presetSeed(preset, templates) {
  return preset && preset.optimizeAfterUpload === true && templates && templates.default ? templates.default : defaultTemplate()
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

// Ngay kieu Studio: tieng Viet "26 thg 10, 2026" | tieng Anh (lang 'en') "Oct 26, 2026"
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTHS_EN_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const cap = (w) => w[0].toUpperCase() + w.slice(1)
function fmtStudioDate(d, lang = 'vi') {
  if (lang === 'en') return `${cap(MONTHS_EN[d.getMonth()])} ${d.getDate()}, ${d.getFullYear()}`
  return `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}`
}
// Nhan (aria-label) khoi thang trong lich chon ngay: "thg 10 2026" | "Oct 2026" | "October 2026"
const calendarMonthLabels = (d) => [`thg ${d.getMonth() + 1} ${d.getFullYear()}`, `${cap(MONTHS_EN[d.getMonth()])} ${d.getFullYear()}`, `${cap(MONTHS_EN_FULL[d.getMonth()])} ${d.getFullYear()}`]
// Nhan thang -> so thang (nam*12 + thang 0..11) de so sanh / lui toi; khong doc duoc -> null
function parseMonthLabel(s) {
  s = String(s || '').normalize('NFC').trim()
  let m = /(?:thg|tháng)\s*(\d{1,2})(?:\s*,?\s*năm)?\s*,?\s*(\d{4})/i.exec(s)
  if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 12 + (+m[1] - 1)
  m = /\b([A-Za-z]{3,})\.?,?\s+(\d{4})\b/.exec(s)
  if (!m) return null
  const w = m[1].toLowerCase()
  const i = MONTHS_EN_FULL.findIndex((x) => x.startsWith(w)) // "Sep" | "Sept" | "September"
  return i < 0 ? null : +m[2] * 12 + i
}
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

// Cac chu chap nhan duoc [vi, en] cho lua chon mau muon chon trong Studio (giao dien Viet hoac Anh).
// kind: 'category' (key = id) | 'language' (key = ten tieng Viet, ten tieng Anh cung duoc) | 'license' | 'comments'
function optionNames(kind, key) {
  if (kind === 'category') return CATEGORY_NAMES[key] ? [CATEGORY_NAMES[key], CATEGORY_NAMES_EN[key]] : []
  if (kind === 'language') {
    const k = String(key || '').trim()
    if (!k) return []
    const vi = Object.keys(LANGUAGE_EN).find((x) => lc(x) === lc(k) || lc(LANGUAGE_EN[x]) === lc(k))
    return vi ? [vi, LANGUAGE_EN[vi]] : [k] // ngon ngu ngoai danh sach: dung chu nguoi dung go
  }
  const m = OPTION_NAMES[kind]
  return m && m[key] ? [...m[key]] : []
}
const sameAny = (v, names) => names.some((n) => lc(n) === lc(v))

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
  if (t.playlists.length || t.playlistAuto) out.push('playlists')
  for (const k of ['paidPromotion', 'ai', 'remix', 'endScreen', 'recordingDate', 'license', 'embeddable', 'comments', 'category']) if (t[k] !== 'keep') out.push(k)
  if (t.tagsMode !== 'keep' || t.extraTags.length) out.push('tags')
  if (t.location) out.push('location')
  if (t.language) out.push('language')
  if (t.like) out.push('like')
  if (t.description) out.push('description')
  if (t.comment) out.push('comment')
  return out
}

// Che do hien thi trong cot "Che do hien thi" cua trang Noi dung (Studio Viet hoac Anh):
// 'public' | 'unlisted' | 'private' | 'scheduled' | 'premiere' | '' (khong biet)
const VISIBILITY = {
  public: ['công khai', 'public'],
  unlisted: ['không công khai', 'unlisted'],
  private: ['riêng tư', 'private'],
  scheduled: ['đã lên lịch', 'lên lịch', 'scheduled'],
  premiere: ['công chiếu', 'đang công chiếu', 'đã công chiếu', 'sắp công chiếu', 'premiere', 'premiered', 'premieres', 'premiering'],
}
function visibilityKind(s) {
  const v = lc(s)
  return Object.keys(VISIBILITY).find((k) => VISIBILITY[k].includes(v)) || ''
}
// Binh luan duoc tren trang xem: cong khai / khong cong khai; chua biet che do (chuoi rong) thi thu
const canCommentVisibility = (s) => !lc(s) || ['public', 'unlisted'].includes(visibilityKind(s))

// ---- optimized.json: { [channelKey]: { [videoId]: { at, title, pinned, warnings } } } ----
function markOptimized(db, channelKey, videoId, info = {}) {
  const out = { ...(db || {}) }
  out[channelKey] = { ...(out[channelKey] || {}), [videoId]: { at: new Date().toISOString(), ...info } }
  return out
}
const isOptimized = (db, channelKey, videoId) => !!(db && db[channelKey] && db[channelKey][videoId])

// ---- quet: so gia tri doc duoc tren trang Chi tiet video voi mau ----
// read: gia tri doc boi inspectVideo (src/flows/optimize.js); muc undefined = khong doc duoc / khong doc.
//   playlists: { count, items?: [{ name, id, on }] }, paidPromotion/ai/remix: 'yes'|'no'|'all'|... ('' = chua chon),
//   tags: [..], language: [ngon ngu video, ngon ngu tieu de], recordingDate/location/category: chu,
//   license: { value: 'youtube'|'creativeCommon'|'', locked }, embeddable: bool, comments: 'on'|'pause'|'off'|''
// Tra ve { missing, filled, unknown } (ten muc cua mau). Muc 'keep' bo qua.
function playlistsFilled(p, t) {
  if (!p) return undefined
  if (p.items) {
    const named = t.playlists.every((want) => {
      const hits = p.items.filter((x) => lc(x.name) === lc(want) || (x.id && x.id === want))
      return hits.every((x) => x.on) // khong co danh sach nay trong kenh -> khong tinh la thieu
    })
    const on = p.items.filter((x) => x.on).length
    return named && on >= Math.min(t.playlistAuto, p.items.length)
  }
  if (t.playlists.length) return p.count ? undefined : false // co ten -> can mo hop thoai moi biet
  return p.count >= t.playlistAuto
}
function compareFields(read, template, { title = '' } = {}) {
  const t = normalizeTemplate(template)
  const r = read || {}
  const checks = []
  const add = (k, v) => checks.push([k, v])
  const has = (k) => r[k] !== undefined && r[k] !== null
  if (t.description) add('description', has('description') ? !!String(r.description).trim() : undefined)
  if (t.playlists.length || t.playlistAuto) add('playlists', playlistsFilled(r.playlists, t))
  for (const k of ['paidPromotion', 'ai', 'remix', 'comments']) if (t[k] !== 'keep') add(k, has(k) ? r[k] === t[k] : undefined)
  if (t.tagsMode !== 'keep' || t.extraTags.length) add('tags', has('tags') ? tagsToAdd(r.tags, t, title).add.length === 0 : undefined)
  if (t.language) add('language', has('language') ? r.language.every((x) => sameAny(x, optionNames('language', t.language))) : undefined)
  if (t.recordingDate !== 'keep') add('recordingDate', has('recordingDate') ? !!String(r.recordingDate).trim() : undefined)
  if (t.location) add('location', has('location') ? !!String(r.location).trim() : undefined)
  // giay phep bi khoa: Studio khong cho doi -> khong tinh la thieu
  if (t.license !== 'keep') add('license', has('license') ? r.license.locked || r.license.value === t.license : undefined)
  if (t.embeddable !== 'keep') add('embeddable', has('embeddable') ? r.embeddable === (t.embeddable === 'yes') : undefined)
  if (t.category !== 'keep') add('category', has('category') ? sameAny(r.category, optionNames('category', t.category)) : undefined)
  if (t.endScreen !== 'keep') add('endScreen', has('endScreen') ? !!r.endScreen : undefined) // trang Chi tiet khong cho biet
  const out = { missing: [], filled: [], unknown: [] }
  for (const [k, v] of checks) out[v === true ? 'filled' : v === false ? 'missing' : 'unknown'].push(k)
  return out
}

module.exports = {
  CATEGORY_NAMES, CATEGORY_NAMES_EN, STUDIO_LANGUAGES, LANGUAGE_EN, optionNames, calendarMonthLabels, parseMonthLabel, visibilityKind, canCommentVisibility, COMMENT_VARS, defaultTemplate, normalizeTemplate, templateFor, setTemplate,
  keepAll, afterUploadTemplate, refreshPending, API_PRESET_FIELDS, migrateApiPreset, presetSeed,
  renderComment, tagsToAdd, tagLength, fmtStudioDate, parseStudioDate, recordingDateFor, touchedFields, markOptimized, isOptimized, compareFields,
}
