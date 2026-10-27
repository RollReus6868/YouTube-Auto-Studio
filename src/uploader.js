// Dang mot video tu dau den cuoi bang hop thoai tai len cua YouTube Studio (src/flows/upload.js):
// tai len + chi tiet + mau Studio cua preset + phu de + che do hien thi -> chuyen thu muc vao da-dang/.
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

// Viec cho hop thoai tai len, tu ket qua buildVideoMeta (src/metadata.js) + mau Studio cua preset
function jobOf(item, uc, template = null, channelName = '') {
  const m = item.meta
  return {
    uc, file: item.video, title: m.title, description: m.description, tags: m.tags,
    playlists: m.playlist ? [m.playlist] : [], madeForKids: !!m.madeForKids, thumbnail: m.thumbnail || null,
    subtitles: m.subtitles || [], privacy: m.privacy, publishAt: m.publishAt || null,
    notifySubscribers: m.notifySubscribers !== false, template, channelName,
  }
}

const PRIVACY = { public: 'Công khai', unlisted: 'Không công khai', private: 'Riêng tư' }
const FIELD_NAMES = {
  playlists: 'danh sách phát', paidPromotion: 'quảng cáo trả tiền', ai: 'sử dụng AI', tags: 'thẻ', language: 'ngôn ngữ', recordingDate: 'ngày quay',
  location: 'vị trí', license: 'giấy phép', embeddable: 'cho phép nhúng', notify: 'thông báo người đăng ký', remix: 'phối lại Shorts', category: 'danh mục',
  comments: 'bình luận', endScreen: 'màn hình kết thúc',
}

// page: Page da o dung kenh (ctx.withChannel). item: { folder, video, meta (co thumbnail, subtitles: [{file, lang}]) }
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
    r.schedule ? `Lên lịch công khai: ${new Date(r.schedule).toLocaleString('vi-VN')}` : `Chế độ: ${PRIVACY[m.privacy] || m.privacy}`,
    ...warnings.map((w) => `Lưu ý: ${w}`),
  ]
  const mv = root ? moveDone(root, item.folder, lines) : { moved: false, folder: item.folder }
  if (root && !mv.moved) log('warn', `Không chuyển được thư mục vào ${DIRS.done}/ (${mv.error}). Hãy tự chuyển để lần sau không đăng lại.`)
  return { id, url, warnings, folder: mv.folder, moved: mv.moved, schedule: r.schedule || null, missed, after }
}

module.exports = { uploadOne, jobOf, moveDone, freeName }
