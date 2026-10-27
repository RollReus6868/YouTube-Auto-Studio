// Bai kiem cho src/flows/optimize.js tren trang gia tests/mock-yt/optimize
const assert = require('assert')
const { listVideos, optimizeVideo, commentAndPin } = require('../../src/flows/optimize')
const { defaultTemplate } = require('../../src/optimize-template')

const UC = 'UC6roez1tiwHbdhvLWBvLRmQ'
const VID = 'vyiSqHByq24'
const TITLE = 'The Cost of Being Chosen by God - Matthew 22 Explained'
const NOW = new Date(2026, 9, 26, 21, 9)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const events = async (mock, type) => { await sleep(300); return mock.events.filter((e) => e.type === type) }
const CH = { name: 'Dark Bible Study', handle: '@DarkBibleStudy999', ucId: UC }
const fs = require('fs')
// dat tinh huong cho trang xem video gia (localStorage, giu qua tai lai trang)
const flags = async (page, urls, f) => {
  await page.goto(`${urls.youtube}/watch?v=${VID}`)
  await page.eval((f) => { for (const [k, v] of Object.entries(f)) localStorage.setItem(k, JSON.stringify(v)) }, f)
}
const KEEP = { playlists: [], paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', extraTags: [], location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', category: 'keep', language: '', comments: 'keep', license: 'keep', embeddable: 'keep', like: false, description: '', comment: '', pin: false }

module.exports = [
  ['doc danh sach video (2 trang)', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-pp', '5'))
    const list = await listVideos(page, UC, { urls })
    assert.equal(list.length, 7)
    assert.deepEqual(list[1], { id: VID, title: TITLE, visibility: 'Công khai', date: '25 thg 10, 2026', dateNote: 'Đã phát hành lần…', views: '30', comments: '0' })
    assert.equal(list[0].visibility, 'Đang công chiếu')
    assert.equal(list[6].id, 'HonorPar001', 'doc ca trang 2')
  }],

  ['chi doc N video moi nhat (limit)', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-pp', '2'))
    const list = await listVideos(page, UC, { urls, limit: 3 })
    assert.equal(list.length, 3)
    assert.equal(list[1].id, VID)
  }],

  ['mo ta: video chua co thi dien, da co thi giu nguyen', async ({ page, urls, mock }) => {
    const tpl = { ...KEEP, description: '{tieu_de}\nKênh {ten_kenh}: {link}' }
    const r = await optimizeVideo(page, 'NoDescVid01', tpl, { urls, now: NOW, channelName: 'Dark Bible Study' })
    assert.deepEqual([r.changed, r.saved], [['description'], true])
    const [save] = await events(mock, 'save')
    assert.equal(save.data.desc, 'Video NoDescVid01\nKênh Dark Bible Study: https://youtu.be/NoDescVid01')
    mock.events.length = 0
    const again = await optimizeVideo(page, 'NoDescVid01', tpl, { urls, now: NOW, channelName: 'Dark Bible Study' })
    assert.deepEqual([again.changed, again.saved], [[], false], 'da co mo ta (lan truoc dien) -> giu nguyen')
    const keep = await optimizeVideo(page, VID, tpl, { urls, now: NOW })
    assert.deepEqual([keep.changed, keep.saved], [[], false])
    assert.deepEqual(await events(mock, 'save'), [])
    assert.match(await page.text({ selector: '#description-textarea #textbox' }), /In this episode of Dark Bible Study/)
  }],

  ['toi uu day du theo mau mac dinh (giong video quay)', async ({ page, urls, mock }) => {
    const steps = []
    const r = await optimizeVideo(page, VID, { ...defaultTemplate(), playlists: ['Dark Bible Study'] }, { urls, now: NOW, onStep: (s) => steps.push(s) })
    assert.equal(r.title, TITLE)
    assert.equal(r.saved, true)
    assert.deepEqual(r.warnings, [])
    assert.deepEqual(r.changed, ['playlists', 'paidPromotion', 'ai', 'tags', 'recordingDate', 'location', 'remix', 'endScreen'])
    const [save] = await events(mock, 'save')
    const d = save.data
    assert.deepEqual(d.playlists, ['PLa', 'PLb'], 'tich ca 2 danh sach trung ten (1 Podcast), khong tich "Bible Stories"')
    assert.equal(d.paid, 'Không, video của tôi không chứa nội dung được trả tiền để quảng cáo')
    assert.equal(d.ai, 'Có')
    assert.deepEqual(d.tags, ['Dark Bible Study', TITLE])
    assert.equal(d.recDate, '26 thg 10, 2026')
    assert.equal(d.location, 'United States')
    assert.equal(d.remix, 'Không cho phép phối lại')
    assert.deepEqual([d.category, d.comments, d.language, d.license, d.embed], ['Mọi người và blog', 'Bật', 'Tiếng Anh (Hoa Kỳ)', 'Giấy phép chuẩn của YouTube', true], 'muc giu nguyen khong doi')
    const [es] = await events(mock, 'endscreen')
    assert.equal(es.tile, 'Lấy màn hình kết thúc của video gần đây nhất')
    assert(steps.includes('Danh sách phát') && steps.includes('Lưu'))
    // chay lai: moi muc da dung -> khong bam gi, nut Luu van khoa, khong luu lai
    mock.events.length = 0
    const again = await optimizeVideo(page, VID, { ...defaultTemplate(), playlists: ['Dark Bible Study'] }, { urls, now: NOW })
    assert.deepEqual([again.changed, again.saved], [[], false])
    assert.match(again.warnings[0], /Màn hình kết thúc/)
    assert.deepEqual(await events(mock, 'save'), [])
  }],

  ['mot muc loi (khong thay muc AI) va vi tri khong co goi y: bao canh bao, cac muc khac van luu', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/video/${VID}/edit`)
    await page.eval(() => localStorage.setItem('opt-noai', '1'))
    page.timeout = 3000
    const r = await optimizeVideo(page, VID, { ...defaultTemplate(), location: 'Atlantis' }, { urls, now: NOW })
    await page.eval(() => localStorage.removeItem('opt-noai'))
    assert.equal(r.saved, true)
    assert.deepEqual(r.changed, ['paidPromotion', 'tags', 'recordingDate', 'remix', 'endScreen'])
    assert.match(r.warnings.join('\n'), /Bỏ qua mục "Sử dụng AI": Quá 3 giây vẫn chưa thấy mục "Sử dụng AI"/)
    assert.match(r.warnings.join('\n'), /Không thấy "Atlantis" trong gợi ý vị trí, giữ nguyên vị trí/)
    const [save] = await events(mock, 'save')
    assert.equal(save.data.remix, 'Không cho phép phối lại')
    assert.equal(save.data.location, '', 'vi tri cu (trong) duoc giu')
    assert.equal(await page.value({ selector: '#location input' }), '', 'chu "Atlantis" khong con trong o')
  }],

  ['ep cac muc khac theo mau (ngon ngu, danh muc, binh luan, nhung, ngay dang)', async ({ page, urls, mock }) => {
    const tpl = { ...KEEP, language: 'Tiếng Việt', category: '27', comments: 'off', embeddable: 'no', license: 'creativeCommon', recordingDate: 'publish', playlists: ['Không Có Thật'], tagsMode: 'title', extraTags: ['bible study'] }
    const r = await optimizeVideo(page, VID, tpl, { urls, now: NOW, video: { date: '25 thg 10, 2026' } })
    const [save] = await events(mock, 'save')
    const d = save.data
    assert.deepEqual([d.language, d.titleLanguage, d.category, d.comments, d.embed, d.recDate], ['Tiếng Việt', 'Tiếng Việt', 'Giáo dục', 'Tắt', false, '25 thg 10, 2026'])
    assert.deepEqual(d.tags, ['Dark Bible Study', TITLE, 'bible study'])
    assert.equal(d.license, 'Giấy phép chuẩn của YouTube', 'giay phep bi khoa -> giu nguyen')
    assert.deepEqual(d.playlists, [])
    assert.equal(r.warnings.length, 2)
    assert.match(r.warnings.join('\n'), /Không thấy danh sách phát "Không Có Thật"/)
    assert.match(r.warnings.join('\n'), /Giấy phép bị khóa/)
    assert.deepEqual(await events(mock, 'endscreen'), [], 'man hinh ket thuc = giu nguyen')
  }],

  ['mau "giu nguyen" het: khong dung vao muc nao', async ({ page, urls, mock }) => {
    const r = await optimizeVideo(page, VID, KEEP, { urls, now: NOW })
    assert.deepEqual([r.changed, r.saved, r.warnings], [[], false, []])
    assert.deepEqual(await events(mock, 'save'), [])
    assert.deepEqual(await events(mock, 'endscreen'), [])
    assert.equal(await page.text({ selector: '#pl-trigger .dropdown-trigger-text' }), 'Chọn')
    assert.equal(await page.text({ selector: '#recorded-date .dropdown-trigger-text' }), 'Không chọn')
  }],

  ['thich + binh luan + ghim, kiem lai sau khi tai lai trang; chay lai khong dang lai', async ({ page, urls, mock }) => {
    const logs = []
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH, log: (l, m) => logs.push(`${l} ${m}`) })
    assert.deepEqual([r.liked, r.posted, r.commented, r.pinned, r.warnings, r.blocker], [true, true, true, true, [], ''], logs.join('\n'))
    assert.deepEqual((await events(mock, 'comment')).map((e) => [e.text, e.author]), [[TITLE, CH.handle]])
    assert.equal((await events(mock, 'pin')).length, 1)
    assert.deepEqual((await events(mock, 'like')).map((e) => e.liked), [true])
    // cua so an van "hien" voi trang (backgroundThrottling: false) -> IntersectionObserver tai binh luan
    assert.equal(await page.eval(() => document.visibilityState), 'visible')
    assert(logs.some((l) => /Ô bình luận trên YouTube đang dùng kênh "Dark Bible Study"/.test(l)), logs.join('\n'))
    assert(logs.some((l) => /^ok Trang xem video \(đã kiểm lại\): thích ✓, bình luận ✓, ghim ✓/.test(l)), logs.join('\n'))
    assert(await page.has('Đã ghim bởi @DarkBibleStudy999'), 'trang da tai lai, binh luan ghim o dau')
    mock.events.length = 0
    const again = await commentAndPin(page, VID, TITLE, { urls, channel: CH })
    assert.deepEqual([again.liked, again.posted, again.commented, again.pinned, again.warnings], [true, false, true, true, []])
    assert.deepEqual([await events(mock, 'comment'), await events(mock, 'pin'), await events(mock, 'like')], [[], [], []], 'khong binh luan, ghim, bam thich lai')
  }],

  ['binh luan cua kenh nam sau: cuon tai them, "Hàng đầu" thieu thi doi sang "Mới nhất"', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-topcap': 3 })
    const logs = []
    // chi co ten kenh (khong co @handle): nhan ra binh luan cua chu kenh nho huy hieu chu kenh
    const r = await commentAndPin(page, VID, 'Cảm ơn mọi người đã xem!', { urls, like: false, pin: false, channel: { name: CH.name }, log: (l, m) => logs.push(`${l} ${m}`) })
    assert.deepEqual([r.posted, r.commented, r.pinned, r.warnings], [true, true, false, []], logs.join('\n'))
    assert(logs.some((l) => /chuyển sang "Mới nhất"/.test(l)), logs.join('\n'))
    mock.events.length = 0
    await flags(page, urls, { 'opt-topcap': 0 })
    const again = await commentAndPin(page, VID, 'Cảm ơn mọi người đã xem!', { urls, like: false, pin: false, channel: CH })
    assert.deepEqual([again.posted, again.commented], [false, true], 'tim thay sau khi cuon (luot thu 8), khong dang lai')
    assert.deepEqual(await events(mock, 'comment'), [])
  }],

  ['chua dang nhap youtube.com: bao ro, khong lam gi', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-signedout': true })
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH })
    assert.deepEqual([r.liked, r.commented, r.pinned, r.blocker], [false, false, false, 'signedOut'])
    assert.match(r.warnings[0], /chưa đăng nhập/)
    assert.equal(r.shots.length, 1)
    assert(fs.existsSync(`${r.shots[0]}.png`) && fs.existsSync(`${r.shots[0]}.html`))
    assert.deepEqual([await events(mock, 'like'), await events(mock, 'comment')], [[], []])
  }],

  ['binh luan bi tat: van thich, bao "bị tắt", khong bao thanh cong', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-cmtoff': true })
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH })
    assert.deepEqual([r.liked, r.commented, r.pinned, r.blocker], [true, false, false, 'commentsOff'])
    assert.match(r.warnings.join('\n'), /Tính năng bình luận đã bị tắt/)
    assert.deepEqual(await events(mock, 'comment'), [])
  }],

  ['youtube.com dang dung kenh khac: khong thich / binh luan; khong biet ten kenh thi kiem tac gia', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-as': { name: 'Kênh Phụ', handle: '@KenhPhu' } })
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH })
    assert.deepEqual([r.liked, r.commented, r.pinned, r.blocker], [false, false, false, 'wrongChannel'])
    assert.match(r.warnings[0], /Đang bình luận bằng kênh "Kênh Phụ", không phải kênh "Dark Bible Study"/)
    assert.deepEqual([await events(mock, 'like'), await events(mock, 'comment')], [[], []])
    // chi biet @handle: binh luan dang len duoi ten kenh khac -> khong tinh la da binh luan
    const r2 = await commentAndPin(page, VID, TITLE, { urls, like: false, channel: { handle: CH.handle } })
    assert.deepEqual([r2.posted, r2.commented, r2.pinned], [false, false, false])
    assert.match(r2.warnings[0], /Bình luận hiện dưới tên "@kenhphu", không phải kênh "@DarkBibleStudy999"/)
  }],

  ['ghim khong an (huy hieu van rong): canh bao, khong bao da ghim', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-pinfail': 'silent' })
    const r = await commentAndPin(page, VID, TITLE, { urls, like: false, channel: CH })
    assert.deepEqual([r.commented, r.pinned], [true, false])
    assert.match(r.warnings.join('\n'), /Chưa ghim được bình luận: Không thấy huy hiệu "Đã ghim"/)
    assert.equal((await events(mock, 'pin')).length, 1)
  }],

  ['ghim chi hien tren trang, tai lai thi mat: pinned=false', async ({ page, urls }) => {
    await flags(page, urls, { 'opt-pinfail': 'local' })
    const r = await commentAndPin(page, VID, TITLE, { urls, like: false, channel: CH })
    assert.deepEqual([r.commented, r.pinned], [true, false])
    assert.match(r.warnings.join('\n'), /Sau khi tải lại trang, bình luận của kênh không được ghim/)
    assert(r.shots.length >= 1)
  }],

  ['thich khong duoc luu (tai lai thi mat): liked=false', async ({ page, urls }) => {
    await flags(page, urls, { 'opt-likefail': true })
    const r = await commentAndPin(page, VID, '', { urls, channel: CH })
    assert.deepEqual([r.liked, r.commented], [false, false])
    assert.match(r.warnings.join('\n'), /Sau khi tải lại trang, video chưa được thích/)
  }],

  ['binh luan bi giu lai (chi hien tren trang): commented=false', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-cmtlocal': true })
    const r = await commentAndPin(page, VID, `${TITLE}\nXem lại: https://youtu.be/${VID}`, { urls, like: false, channel: CH })
    assert.deepEqual([r.posted, r.commented, r.pinned], [true, false, false])
    assert.match(r.warnings.join('\n'), /tải lại trang thì không thấy nữa/)
    assert.equal((await events(mock, 'comment')).length, 1)
  }],

  ['menu khong co "Ghim" -> giu binh luan + canh bao; lan sau chi ghim', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-nopin': true })
    const text = `${TITLE}\nXem lại: https://youtu.be/${VID}`
    const r = await commentAndPin(page, VID, text, { urls, like: false, channel: CH })
    assert.deepEqual([r.liked, r.commented, r.pinned], [false, true, false])
    assert.match(r.warnings[0], /Chưa ghim được bình luận: Menu của bình luận không có "Ghim"/)
    assert.deepEqual(await events(mock, 'like'), [])
    assert.equal((await events(mock, 'comment')).length, 1)
    mock.events.length = 0
    await page.eval(() => localStorage.removeItem('opt-nopin'))
    const again = await commentAndPin(page, VID, text, { urls, like: false, channel: CH })
    assert.deepEqual([again.posted, again.commented, again.pinned, again.warnings], [false, true, true, []])
    assert.deepEqual(await events(mock, 'comment'), [])
    assert.equal((await events(mock, 'pin')).length, 1)
  }],

  ['video chua co binh luan nao: dang + ghim, khong doi sap xep', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-comments-NoDescVid01': [] })
    const logs = []
    const t0 = Date.now()
    const r = await commentAndPin(page, 'NoDescVid01', 'Bình luận đầu tiên', { urls, channel: CH, log: (l, m) => logs.push(`${l} ${m}`) })
    assert.deepEqual([r.liked, r.posted, r.commented, r.pinned, r.warnings], [true, true, true, true, []], logs.join('\n'))
    assert(!logs.some((l) => /Mới nhất/.test(l)), 'khong co binh luan thi khong doi sap xep')
    assert(Date.now() - t0 < 30000, `qua lau: ${Date.now() - t0} ms`)
    assert.equal((await events(mock, 'pin')).length, 1)
  }],

  ['khong ghim khi tat; binh luan rong thi chi thich', async ({ page, urls, mock }) => {
    const r = await commentAndPin(page, VID, 'Cảm ơn mọi người đã xem!', { urls, pin: false, channel: CH })
    assert.deepEqual([r.commented, r.pinned, r.warnings], [true, false, []])
    assert.deepEqual(await events(mock, 'pin'), [])
    mock.events.length = 0
    const only = await commentAndPin(page, 'LostTribe01', '', { urls, channel: CH })
    assert.deepEqual([only.liked, only.commented, only.warnings], [true, false, []])
    assert.deepEqual(await events(mock, 'comment'), [])
  }],
]

// Tinh nang (src/features/optimize.js) voi ctx gia: withChannel chay ngay tren page cua bai kiem.
module.exports.push(['tinh nang: quet, toi uu da chon, nho video da toi uu', async ({ page, urls, mock, tmp }) => {
  const path = require('path')
  const fs = require('fs')
  const logs = []
  let saved = {}
  const state = { f: {} }
  const ctx = {
    state, push: () => {}, log: (l, m) => logs.push(`${l} ${m}`), logFile: (n) => path.join(tmp, n), urls,
    store: { get settings() { return saved }, save: (p) => { saved = { ...saved, ...p } } }, refreshSettings: () => {},
    stopped: () => false, resetStop: () => {},
    accounts: { channels: () => [{ key: UC, ucId: UC, name: 'Dark Bible Study', handle: '@DarkBibleStudy999' }], find: (k) => (k === UC ? { key: UC, ucId: UC, name: 'Dark Bible Study' } : null) },
    withChannel: async (key, fn) => fn(page),
  }
  const f = require('../../src/features/optimize')(ctx)
  f.start()
  const S = state.f.optimize
  assert.equal(S.channelKey, UC)
  f.commands.optimize_template_save({ channelKey: UC, template: { ...defaultTemplate(), playlists: ['Dark Bible Study'], comment: '{tieu_de} | {ten_kenh}' } })
  assert.deepEqual(saved.optimizeTemplates[UC].playlists, ['Dark Bible Study'])
  await f.commands.optimize_list(UC)
  assert.equal(S.videos.length, 7)
  assert(S.videos.every((v) => v.status === 'new'))
  await f.commands.optimize_run({ channelKey: UC, ids: ['Prem0000001', VID] })
  assert.deepEqual(S.videos.slice(0, 2).map((v) => v.status), ['done', 'done'], logs.join('\n'))
  assert.match(S.videos[0].warnings.join(' '), /Đang công chiếu/, 'cong chieu: khong binh luan')
  assert.deepEqual((await events(mock, 'comment')).map((e) => e.text), [`${TITLE} | Dark Bible Study`])
  const db = JSON.parse(fs.readFileSync(path.join(tmp, 'optimized.json'), 'utf8'))
  assert.deepEqual(Object.keys(db[UC]).sort(), ['Prem0000001', VID].sort())
  assert.deepEqual([db[UC][VID].liked, db[UC][VID].commented, db[UC][VID].pinned, db[UC][VID].missing], [true, true, true, []], 'luu dung ket qua da kiem lai')
  assert.deepEqual(S.videos.find((v) => v.id === VID).missing, [])
  // quet lai: 2 video "Da toi uu", 5 chua
  await f.commands.optimize_list(UC)
  assert.deepEqual(S.videos.map((v) => v.status).filter((s) => s === 'done').length, 2)
  // tu toi uu sau khi dang: xep hang cho, toi gio thi chay
  mock.events.length = 0
  ctx.afterUpload({ videoId: 'NeverProp01', title: 'God Was Never Their Property', preset: { optimizeAfterUpload: false }, channelId: UC })
  ctx.afterUpload({ videoId: 'NeverProp01', title: 'God Was Never Their Property', preset: { optimizeAfterUpload: true }, channelId: UC })
  assert.equal(await f.processPending(Date.now()), 0, 'chua toi gio (cho YouTube xu ly)')
  assert.equal(await f.processPending(Date.now() + 16 * 60e3), 1, logs.slice(-5).join('\n'))
  assert(JSON.parse(fs.readFileSync(path.join(tmp, 'optimized.json'), 'utf8'))[UC].NeverProp01)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'optimize-pending.json'), 'utf8')), [])
  assert.equal((await events(mock, 'save')).length, 1)
  assert.deepEqual((await events(mock, 'comment')).map((e) => e.text), ['God Was Never Their Property: John 1 and Black Faith | Dark Bible Study'], 'preset chua co mau -> mau cua kenh')
  // preset co mau Studio rieng: dung mau cua preset, cac muc API da dat (AI, danh muc...) giu nguyen
  mock.events.length = 0
  const preset = { id: 'p1', optimizeAfterUpload: true, optimize: { ...defaultTemplate(), ai: 'no', category: '27', license: 'creativeCommon', embeddable: 'no', remix: 'audio', comment: 'Mẫu preset: {tieu_de}' } }
  ctx.afterUpload({ videoId: 'Maccabee001', title: 'Who Decides?', preset, channelId: UC })
  const pend = JSON.parse(fs.readFileSync(path.join(tmp, 'optimize-pending.json'), 'utf8'))
  assert.deepEqual([pend[0].presetId, pend[0].tpl.ai, pend[0].tpl.category, pend[0].tpl.remix], ['p1', 'keep', 'keep', 'audio'], 'luu id preset + mau tren hang cho')
  // nguoi dung sua preset sau khi dang -> dung ban moi nhat cua preset
  saved.presets = [{ ...preset, optimize: { ...preset.optimize, comment: 'Mẫu mới: {tieu_de}' } }]
  assert.equal(await f.processPending(Date.now() + 16 * 60e3), 1, logs.slice(-5).join('\n'))
  const [sv] = await events(mock, 'save')
  assert.equal(sv.data.remix, 'Chỉ cho phép phối lại âm thanh')
  assert.deepEqual([sv.data.ai, sv.data.category, sv.data.license, sv.data.embed], ['', 'Mọi người và blog', 'Giấy phép chuẩn của YouTube', true], 'muc API giu nguyen')
  assert.deepEqual((await events(mock, 'comment')).map((e) => e.text), [`Mẫu mới: ${S.videos.find((v) => v.id === 'Maccabee001').title}`])
  // ghim khong an tren YouTube: van "Da toi uu" nhung ghi ro chua ghim (khong bao thanh cong gia)
  await flags(page, urls, { 'opt-pinfail': 'silent' })
  f.commands.optimize_template_save({ channelKey: UC, template: { ...KEEP, like: true, comment: 'Ghim thử {tieu_de}', pin: true } })
  await f.commands.optimize_run({ channelKey: UC, ids: ['TheCross001'] })
  const tc = S.videos.find((v) => v.id === 'TheCross001')
  assert.deepEqual([tc.status, tc.missing], ['done', ['ghim']], logs.slice(-6).join('\n'))
  const dbx = JSON.parse(fs.readFileSync(path.join(tmp, 'optimized.json'), 'utf8'))[UC].TheCross001
  assert.deepEqual([dbx.liked, dbx.commented, dbx.pinned, dbx.missing], [true, true, false, ['ghim']])
  assert.match(logs.join('\n'), /chưa ghim được \(đã kiểm lại trên trang xem video\)/)
  assert.match(logs[logs.length - 1], /^warn Xong: tối ưu được 1\/1 video, 1 video chưa thích \/ bình luận \/ ghim được/)
  // khong co withChannel -> bao loi ro rang
  ctx.withChannel = null
  await f.commands.optimize_list(UC)
  assert.match(logs[logs.length - 1], /Chưa có tài khoản Google nào/)
}])
