// Dang mot video tu dau den cuoi bang hop thoai tai len cua YouTube Studio (src/flows/upload.js):
// tai len + chi tiet + mau Studio cua preset + phu de + che do hien thi -> chuyen vao da-dang/
// (thu muc phang: file video + thumbnail + phu de + .txt cung ten; kieu cu: ca thu muc con).
// Loi o buoc phu chi canh bao, khong lam hong video da tai. Khong require('electron') de kiem thu bang node.
const fs = require('fs')
const path = require('path')
const { DIRS } = require('./scanner')
const { uploadVideo } = require('./flows/upload')
const { afterUploadTemplate } = require('./optimize-template')

// Thu muc dich khong trung ten: "ten", "ten (2)", ...
function freeName(dir, name) {
  let target = path.join(dir, name)
  for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${name} (${i})`)
  return target
}

// Chuyen thu muc da dang vao <goc>/da-dang/ va ghi ket-qua.txt. Tra ve duong dan moi.
function moveDone(root, folder, lines) {
  fs.writeFileSync(path.join(folder, 'ket-qua.txt'), lines.join('\r\n') + '\r\n')
  const doneDir = path.join(root, DIRS.done)
  fs.mkdirSync(doneDir, { recursive: true })
  const target = freeName(doneDir, path.basename(folder))
  try {
    fs.renameSync(folder, target)
  } catch (e) {
    // Windows: file dang mo (vd trinh xem anh) -> thu lai sau, khong coi la loi dang video
    return { moved: false, folder, error: e.message }
  }
  return { moved: true, folder: target }
}

// Thu muc phang: chuyen cac file cua video (video, thumbnail, phu de, .txt) vao doneDir, ghi "<ten>.ket-qua.txt".
// File dang mo (Windows) thi bo qua file do; video khong chuyen duoc -> moved: false (lich su uploads.json van chan dang lai).
function moveDoneFiles(doneDir, item, lines) {
  fs.mkdirSync(doneDir, { recursive: true })
  const base = path.basename(item.video, path.extname(item.video))
  const free = (name) => {
    const e = path.extname(name)
    const b = name.slice(0, name.length - e.length)
    let target = path.join(doneDir, name)
    for (let i = 2; fs.existsSync(target); i++) target = path.join(doneDir, `${b} (${i})${e}`)
    return target
  }
  let moved = true
  let error = ''
  let video = item.video
  for (const f of [...new Set(item.files && item.files.length ? item.files : [item.video])]) {
    if (!fs.existsSync(f)) continue
    const target = free(path.basename(f))
    try {
      fs.renameSync(f, target)
      if (f === item.video) video = target
    } catch (e) {
      if (f === item.video) { moved = false; error = e.message }
    }
  }
  try { fs.writeFileSync(free(`${base}.ket-qua.txt`), lines.join('\r\n') + '\r\n') } catch (_) { /* khong quan trong */ }
  return { moved, folder: doneDir, video, error }
}

// Viec cho hop thoai tai len, tu ket qua buildVideoMeta (src/metadata.js) + mau Studio cua preset
function jobOf(item, uc, template = null, channelName = '') {
  const m = item.meta
  return {
    uc, file: item.video, title: m.title, description: m.description, tags: m.tags,
    playlists: m.playlist ? [m.playlist] : [], madeForKids: !!m.madeForKids, thumbnail: m.thumbnail || null,
    subtitles: m.subtitles || [], privacy: m.privacy, premiere: !!m.premiere, publishAt: m.publishAt || null, schedulePremiere: !!m.schedulePremiere,
    notifySubscribers: m.notifySubscribers !== false, template, channelName,
  }
}

const PRIVACY = { public: 'Công khai', unlisted: 'Không công khai', private: 'Riêng tư' }
const FIELD_NAMES = {
  playlists: 'danh sách phát', paidPromotion: 'quảng cáo trả tiền', ai: 'sử dụng AI', tags: 'thẻ', language: 'ngôn ngữ', recordingDate: 'ngày quay',
  location: 'vị trí', license: 'giấy phép', embeddable: 'cho phép nhúng', notify: 'thông báo người đăng ký', remix: 'phối lại Shorts', category: 'danh mục',
  comments: 'bình luận', endScreen: 'màn hình kết thúc',
}

// page: Page da o dung kenh (ctx.withChannel). item: { layout: flat|folder, folder, video, files, doneDir, meta (co thumbnail,
// subtitles: [{file, lang}]) }. root: thu muc chua da-dang/ (khi item khong co doneDir).
// preset: mau dang (mau Studio preset.optimize dat trong hop thoai; preset.optimizeAfterUpload: thich / binh luan / ghim sau).
// Tra ve { id, url, warnings, folder, moved, schedule, missed, after } - after: mau toi uu chay sau khi dang (null = khong can)
async function uploadOne(page, item, { urls, uc, root, preset = {}, channelName = '', log = () => {}, onStep = () => {}, onProgress = () => {}, upload = uploadVideo } = {}) {
  const m = item.meta
  const job = jobOf(item, uc, preset.optimize || null, channelName)
  const r = await upload(page, job, { urls, log: (level, msg) => log(level, `${m.title}: ${msg}`), onStep, onProgress })
  const { id, url } = r
  const warnings = [...r.warnings]
  const missed = r.missed || []
  log('ok', `Đã tải lên "${m.title}": ${url}`)
  const after = afterUploadTemplate(preset.optimize, missed.filter((k) => k !== 'notify'), { after: !!preset.optimizeAfterUpload, playlists: job.playlists, tags: job.tags })
  const left = missed.filter((k) => k !== 'notify')
  if (left.length) warnings.push(`Chưa đặt được trong hộp thoại tải lên: ${left.map((k) => FIELD_NAMES[k] || k).join(', ')} (tool sẽ đặt lại trong Studio sau khi đăng).`)
  const lines = [
    `Video: ${url}`,
    `Studio: https://studio.youtube.com/video/${id}/edit`,
    `Tiêu đề: ${m.title}`,
    `Đăng lúc: ${new Date().toLocaleString('vi-VN')}`,
    r.schedule ? `Lên lịch công khai: ${new Date(r.schedule).toLocaleString('vi-VN')}${r.premiere ? ' (Công chiếu)' : ''}` : `Chế độ: ${PRIVACY[m.privacy] || m.privacy}${r.premiere ? ' (Công chiếu ngay)' : ''}`,
    ...warnings.map((w) => `Lưu ý: ${w}`),
  ]
  const doneDir = item.doneDir || (root ? path.join(root, DIRS.done) : '')
  let mv = { moved: false, folder: item.folder }
  if (doneDir && item.layout === 'flat') mv = moveDoneFiles(doneDir, item, lines)
  else if (doneDir) mv = moveDone(path.dirname(doneDir), item.folder, lines)
  if (doneDir && !mv.moved) log('warn', `Không chuyển được ${item.layout === 'flat' ? `file "${path.basename(item.video)}"` : 'thư mục'} vào ${DIRS.done}/ (${mv.error}). Tool vẫn nhớ đã đăng; hãy tự chuyển để khỏi hiện lại.`)
  return { id, url, warnings, folder: mv.folder, moved: mv.moved, schedule: r.schedule || null, missed, after }
}

module.exports = { uploadOne, jobOf, moveDone, moveDoneFiles, freeName }
