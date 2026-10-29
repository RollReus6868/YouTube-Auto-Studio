// Mau mac dinh (preset) kieu hop thoai tai len cua YouTube Studio, dien mau tieu de /
// mo ta va tinh gio dang. Khong require('electron') nen kiem thu duoc bang node thuong.
const { defaultTemplate, normalizeTemplate, API_PRESET_FIELDS, migrateApiPreset } = require('./optimize-template')

// Danh muc YouTube (id so cua YouTube) - mau Studio cua preset chon danh muc theo id nay.
const CATEGORIES = [
  ['1', 'Phim và hoạt hình'], ['2', 'Ô tô và xe cộ'], ['10', 'Âm nhạc'], ['15', 'Thú cưng và động vật'],
  ['17', 'Thể thao'], ['19', 'Du lịch và sự kiện'], ['20', 'Trò chơi'], ['22', 'Mọi người và blog'],
  ['23', 'Hài kịch'], ['24', 'Giải trí'], ['25', 'Tin tức và chính trị'], ['26', 'Hướng dẫn và phong cách'],
  ['27', 'Giáo dục'], ['28', 'Khoa học và công nghệ'], ['29', 'Tổ chức phi lợi nhuận và hoạt động xã hội'],
]

const LIMITS = { title: 100, descriptionBytes: 5000, tags: 500 }

function defaultPreset(id = 'mac-dinh', name = 'Mặc định') {
  return {
    id, name,
    title: '{ten_video}',
    description: '{ten_video}\n\n{hashtag}',
    tags: [],
    playlist: '', // ten danh sach phat (chua co thi tool tao trong hop thoai tai len)
    madeForKids: false,
    notifySubscribers: true,
    privacy: 'private', // public | unlisted | private (khi len lich: Studio de rieng tu toi gio dang)
    premiere: false, // Cong khai: "Dat o che do Cong chieu ngay"
    schedulePremiere: false, // Len lich: "Dat lam video Cong chieu"
    // Len lich ("Dat lich chuyen sang che do cong khai"): now = khong len lich | date = ngay + gio cu the (video sau cach
    // intervalHours) | times = khung gio co dinh moi ngay | interval = cach nhau deu N gio tu times[0]
    schedule: { mode: 'now', times: ['19:00'], intervalHours: 24, date: '', time: '09:00' },
    optimizeAfterUpload: false, // sau khi dang: thich / binh luan / ghim (+ dat lai muc chua dat duoc) - src/features/optimize.js
    optimize: defaultTemplate(), // mau Studio: cac muc dat trong hop thoai tai len (src/optimize-template.js, src/flows/upload.js)
  }
}

// Bu cac truong thieu (preset luu tu ban cu) bang gia tri mac dinh.
// seed: mau Studio cho preset chua co `optimize` (xem presetSeed trong optimize-template.js).
function normalizePreset(p, seed) {
  const d = defaultPreset(p && p.id, p && p.name)
  const out = { ...d, ...(p || {}) }
  out.schedule = { ...d.schedule, ...((p && p.schedule) || {}) }
  out.tags = Array.isArray(out.tags) ? out.tags.map((t) => String(t).trim()).filter(Boolean) : splitTags(out.tags)
  out.schedule.times = (out.schedule.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t))
  if (!out.schedule.times.length) out.schedule.times = ['19:00']
  if (!SCHEDULE_MODES.includes(out.schedule.mode)) out.schedule.mode = 'now'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.schedule.date || '')) out.schedule.date = ''
  if (!/^\d{1,2}:\d{2}$/.test(out.schedule.time || '')) out.schedule.time = '09:00'
  out.schedule.time = out.schedule.time.padStart(5, '0')
  if (!['public', 'unlisted', 'private'].includes(out.privacy)) out.privacy = 'private'
  out.premiere = out.premiere === true
  out.schedulePremiere = out.schedulePremiere === true
  out.optimizeAfterUpload = out.optimizeAfterUpload === true
  out.optimize = normalizeTemplate(p && p.optimize && typeof p.optimize === 'object' ? p.optimize : seed)
  // preset cu (dang qua API): danh muc / ngon ngu / giay phep / nhung / AI chuyen sang mau Studio roi bo
  if (p && API_PRESET_FIELDS.some((k) => k in p)) {
    out.optimize = migrateApiPreset(p, out.optimize)
    for (const k of API_PRESET_FIELDS) delete out[k]
  }
  return out
}

const SCHEDULE_MODES = ['now', 'date', 'times', 'interval']
const splitTags = (s) => String(s || '').split(/[,\n]/).map((t) => t.trim()).filter(Boolean)

const pad = (n) => String(n).padStart(2, '0')
const fmtDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

// {bien} -> gia tri (bien biet nhung rong -> chuoi rong); bien khong biet thi giu nguyen
// de nguoi dung thay ma sua. Don dau cach / dong trong thua do bien rong de lai.
function render(template, vars) {
  return String(template || '')
    .replace(/\{([\p{L}\w]+)\}/gu, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

// Ghep mo ta cuoi cung: phan rieng cua video (Gemini viet / mo ta trong file .txt / mo ta cua mau) va phan mo ta
// mac dinh (Cai dat: link donate, ebook...). position 'above' = phan rieng nam TREN phan mac dinh, 'below' = duoi.
// Phan trong thi bo; hai phan cach nhau mot dong trong. Gioi han 5000 byte / dau < > do validateMeta kiem.
const DESC_POSITIONS = ['above', 'below']
function composeDescription(own, def, position = 'above') {
  const a = String(own || '').trim()
  const b = String(def || '').trim()
  return (position === 'below' ? [b, a] : [a, b]).filter(Boolean).join('\n\n')
}

// Ket qua cuoi cung cho mot video: preset + ghi de tu info.txt.
// extra.settings: cai dat cua app (descDefault: phan mo ta mac dinh, descPosition: above | below).
function buildVideoMeta(item, preset, extra = {}) {
  const p = normalizePreset(preset)
  const info = item.info || {}
  const tags = info.the !== undefined ? splitTags(info.the) : p.tags
  const publishAt = extra.publishAt || null
  const vars = {
    ...info.vars,
    ten_video: info.ten_video || item.name,
    so_tap: info.so_tap || item.episode || '',
    ngay: fmtDate(publishAt ? new Date(publishAt) : extra.now || new Date()),
    ten_kenh: extra.channel || '',
    hashtag: tags.slice(0, 3).map((t) => `#${t.replace(/\s+/g, '')}`).join(' '),
    playlist: info.playlist || p.playlist,
  }
  // thu muc phang: tieu de = ten file (tru khi file .txt rieng co "Tieu de:")
  const title = (item.titleFromName && !info.tieu_de ? String(item.name || '') : render(info.tieu_de || p.title, vars)).trim()
  vars.tieu_de = title
  const settings = extra.settings || {}
  const fixed = render(settings.descDefault || '', vars).trim()
  const description = composeDescription(render(info.mo_ta || p.description, vars), fixed, settings.descPosition)
  const privacy = ['public', 'unlisted', 'private'].includes(info.hien_thi) ? info.hien_thi : p.privacy
  return {
    title, description, tags,
    // co phan mo ta mac dinh: khi dang, thay mo ta Studio dien san (mo ta mac dinh cua kenh) de khong lap dong
    descReplace: !!fixed,
    playlist: info.playlist || p.playlist,
    madeForKids: info.tre_em !== undefined ? info.tre_em : p.madeForKids,
    notifySubscribers: p.notifySubscribers,
    // len lich (publishAt): hop thoai tai len chon "Len lich", Studio de rieng tu toi gio dang roi tu cong khai
    privacy,
    premiere: privacy === 'public' && p.premiere,
    publishAt,
    schedulePremiere: !!publishAt && p.schedulePremiere,
    thumbnail: item.thumbnail || null,
    subtitles: item.subtitles || [],
  }
}

// Kiem tra theo gioi han cua YouTube (tieu de, mo ta, the). Tra ve danh sach loi (rong = hop le).
function validateMeta(m) {
  const errs = []
  if (!m.title) errs.push('Thiếu tiêu đề.')
  if ([...m.title].length > LIMITS.title) errs.push(`Tiêu đề dài ${[...m.title].length} ký tự, YouTube chỉ cho tối đa ${LIMITS.title}.`)
  if (/[<>]/.test(m.title)) errs.push('Tiêu đề không được chứa dấu < hoặc >.')
  if (/[<>]/.test(m.description)) errs.push('Mô tả không được chứa dấu < hoặc >.')
  const bytes = Buffer.byteLength(m.description, 'utf8')
  if (bytes > LIMITS.descriptionBytes) errs.push(`Mô tả dài ${bytes} byte${m.descReplace ? ' (tính cả phần mô tả mặc định trong Cài đặt)' : ''}, YouTube chỉ cho tối đa ${LIMITS.descriptionBytes}.`)
  // YouTube tinh dau phay giua cac the, va the co dau cach duoc tinh them 2 dau ngoac kep
  const tagLen = m.tags.reduce((n, t) => n + [...t].length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, m.tags.length - 1)
  if (tagLen > LIMITS.tags) errs.push(`Thẻ dài ${tagLen} ký tự, YouTube chỉ cho tối đa ${LIMITS.tags}.`)
  const left = (m.title + m.description).match(/\{[\p{L}\w]+\}/u)
  if (left) errs.push(`Còn biến chưa điền: ${left[0]}.`)
  return errs
}

// "19:00" + ngay -> Date gio dia phuong
function at(day, hhmm) {
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0)
}

// Tinh gio dang cho ca hang doi (da sap xep). Tra ve mang { publishAt: ISO|null, warning }.
// Uu tien: gio_dang trong info.txt > ngay trong ten thu muc (+ khung gio cua preset) > lich cua preset.
function planSchedule(items, presetFor, now = new Date()) {
  const used = new Set()
  let cursor = null // moc cuoi cung da xep (cho kieu interval / times)
  const dateCursor = {} // kieu date: moc cuoi cung theo tung lich
  return items.map((item) => {
    const s = normalizePreset(presetFor(item)).schedule
    let when = null
    if (item.info && item.info.gio_dang) {
      when = item.info.gio_dang
    } else if (item.date && s.mode !== 'now') {
      const day = new Date(`${item.date}T00:00:00`)
      const times = s.mode === 'date' ? [s.time] : s.times
      when = item.time ? at(day, item.time) : times.map((t) => at(day, t)).find((d) => !used.has(+d)) || at(day, times[0])
    } else if (s.mode === 'date') {
      // ngay + gio cu the cho video dau; cac video sau cung mau cach nhau intervalHours (0 = cung gio)
      const k = `${s.date} ${s.time} ${s.intervalHours}`
      const start = s.date ? at(new Date(`${s.date}T00:00:00`), s.time) : null
      const step = Math.max(0, Number(s.intervalHours) || 0) * 3600e3
      when = start && dateCursor[k] ? new Date(+dateCursor[k] + step) : start
      if (when) dateCursor[k] = when
    } else if (s.mode === 'times') {
      const times = [...s.times].sort()
      const from = cursor && cursor > now ? cursor : now
      for (let d = 0; d < 400 && !when; d++) {
        const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d)
        when = times.map((t) => at(day, t)).find((x) => x > from && !used.has(+x)) || null
      }
    } else if (s.mode === 'interval') {
      const step = Math.max(1, Number(s.intervalHours) || 24) * 3600e3
      when = cursor ? new Date(+cursor + step) : null
      if (!when) {
        const today = at(now, s.times[0])
        when = today > now ? today : new Date(+today + 86400e3)
      }
    }
    if (!when) return { publishAt: null, warning: '' }
    if (when <= now) return { publishAt: null, warning: 'Giờ đăng đã qua, video sẽ đăng ngay khi tải lên.' }
    used.add(+when)
    if (!cursor || when > cursor) cursor = when
    return { publishAt: when.toISOString(), warning: '' }
  })
}

// Che do hien thi rieng cua mot video (trang Dang video), de len mau / lich cua preset.
//   ov: { mode: 'private' | 'unlisted' | 'public' | 'premiere' | 'schedule', at: ISO (schedule), premiere: bool (schedule) }
// Tra ve { meta, warning }. mode khac / rong: giu nguyen meta.
const VIS_MODES = ['private', 'unlisted', 'public', 'premiere', 'schedule']
function applyVisibility(meta, ov, now = new Date()) {
  if (!ov || !VIS_MODES.includes(ov.mode)) return { meta, warning: '' }
  const out = { ...meta, premiere: false, publishAt: null, schedulePremiere: false }
  if (ov.mode === 'premiere') return { meta: { ...out, privacy: 'public', premiere: true }, warning: '' }
  if (ov.mode !== 'schedule') return { meta: { ...out, privacy: ov.mode }, warning: '' }
  const at = ov.at ? new Date(ov.at) : null
  if (!at || isNaN(+at)) return { meta: { ...out, privacy: 'private' }, warning: 'Chưa chọn giờ lên lịch cho video này: sẽ đăng ở chế độ Riêng tư.' }
  if (at <= now) return { meta: { ...out, privacy: 'private' }, warning: 'Giờ lên lịch của video này đã qua: sẽ đăng ở chế độ Riêng tư. Chọn lại giờ.' }
  return { meta: { ...out, privacy: 'private', publishAt: at.toISOString(), schedulePremiere: !!ov.premiere }, warning: '' }
}

module.exports = { CATEGORIES, LIMITS, SCHEDULE_MODES, DESC_POSITIONS, VIS_MODES, composeDescription, defaultPreset, normalizePreset, splitTags, render, buildVideoMeta, validateMeta, planSchedule, applyVisibility }
