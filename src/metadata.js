// Mau mac dinh (preset) kieu hop thoai tai len cua YouTube Studio, dien mau tieu de /
// mo ta va tinh gio dang. Khong require('electron') nen kiem thu duoc bang node thuong.

// Danh muc YouTube (videoCategories, vung VN) - id la so YouTube dung trong API.
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
    categoryId: '22',
    language: 'vi',
    playlist: '',
    madeForKids: false,
    syntheticMedia: false,
    license: 'youtube', // youtube | creativeCommon
    embeddable: true,
    notifySubscribers: true,
    publicStatsViewable: true,
    privacy: 'private', // public | unlisted | private (khi len lich: luon private toi gio dang)
    schedule: { mode: 'now', times: ['19:00'], intervalHours: 24 }, // now | times | interval
  }
}

// Bu cac truong thieu (preset luu tu ban cu) bang gia tri mac dinh.
function normalizePreset(p) {
  const d = defaultPreset(p && p.id, p && p.name)
  const out = { ...d, ...(p || {}) }
  out.schedule = { ...d.schedule, ...((p && p.schedule) || {}) }
  out.tags = Array.isArray(out.tags) ? out.tags.map((t) => String(t).trim()).filter(Boolean) : splitTags(out.tags)
  out.schedule.times = (out.schedule.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t))
  if (!out.schedule.times.length) out.schedule.times = ['19:00']
  return out
}

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

// Ket qua cuoi cung cho mot video: preset + ghi de tu info.txt.
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
  const title = render(info.tieu_de || p.title, vars).trim()
  vars.tieu_de = title
  const description = render(info.mo_ta || p.description, vars).trim()
  const privacy = ['public', 'unlisted', 'private'].includes(info.hien_thi) ? info.hien_thi : p.privacy
  return {
    title, description, tags,
    categoryId: p.categoryId, language: p.language,
    playlist: info.playlist || p.playlist,
    madeForKids: info.tre_em !== undefined ? info.tre_em : p.madeForKids,
    syntheticMedia: p.syntheticMedia, license: p.license, embeddable: p.embeddable,
    notifySubscribers: p.notifySubscribers, publicStatsViewable: p.publicStatsViewable,
    // API: video len lich phai de private kem publishAt, toi gio YouTube tu chuyen cong khai
    privacy: publishAt ? 'private' : privacy,
    publishAt,
    thumbnail: item.thumbnail || null,
    subtitles: item.subtitles || [],
  }
}

// Kiem tra theo gioi han cua YouTube Data API. Tra ve danh sach loi (rong = hop le).
function validateMeta(m) {
  const errs = []
  if (!m.title) errs.push('Thiếu tiêu đề.')
  if ([...m.title].length > LIMITS.title) errs.push(`Tiêu đề dài ${[...m.title].length} ký tự, YouTube chỉ cho tối đa ${LIMITS.title}.`)
  if (/[<>]/.test(m.title)) errs.push('Tiêu đề không được chứa dấu < hoặc >.')
  if (/[<>]/.test(m.description)) errs.push('Mô tả không được chứa dấu < hoặc >.')
  const bytes = Buffer.byteLength(m.description, 'utf8')
  if (bytes > LIMITS.descriptionBytes) errs.push(`Mô tả dài ${bytes} byte, YouTube chỉ cho tối đa ${LIMITS.descriptionBytes}.`)
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
  return items.map((item) => {
    const s = normalizePreset(presetFor(item)).schedule
    let when = null
    if (item.info && item.info.gio_dang) {
      when = item.info.gio_dang
    } else if (item.date && s.mode !== 'now') {
      const day = new Date(`${item.date}T00:00:00`)
      when = item.time ? at(day, item.time) : s.times.map((t) => at(day, t)).find((d) => !used.has(+d)) || at(day, s.times[0])
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

module.exports = { CATEGORIES, LIMITS, defaultPreset, normalizePreset, splitTags, render, buildVideoMeta, validateMeta, planSchedule }
