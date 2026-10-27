// Bai kiem cho src/flows/optimize.js tren trang gia tests/mock-yt/optimize
const assert = require('assert')
const { listVideos, optimizeVideo, inspectVideo, commentAndPin } = require('../../src/flows/optimize')
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
const KEEP = { playlists: [], playlistAuto: 0, paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', extraTags: [], location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', category: 'keep', language: '', comments: 'keep', license: 'keep', embeddable: 'keep', like: false, description: '', comment: '', pin: false }

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

  ['trang Noi dung kieu moi (tong quan): bam "Xem tất cả" o hang Video roi doc', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-overview', 'true'))
    try {
      const list = await listVideos(page, UC, { urls, limit: 3 })
      assert.deepEqual(list.map((v) => v.id), ['Prem0000001', VID, 'LostTribe01'])
      assert.deepEqual((await events(mock, 'seeall')).map((e) => e.shelf), ['videos'], 'bam dung nut cua hang Video, khong bam hang Bai dang')
    } finally { await page.eval(() => localStorage.removeItem('opt-overview')) }
  }],

  ['trang bang video kieu moi (tieu de "← Video", khong co "Nội dung của kênh"): van doc duoc', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-videohead', 'true'))
    try {
      page.timeout = 5000
      const list = await listVideos(page, UC, { urls, limit: 2 })
      assert.deepEqual(list.map((v) => v.id), ['Prem0000001', VID])
    } finally { await page.eval(() => localStorage.removeItem('opt-videohead')) }
  }],

  ['chi doc N video moi nhat (limit)', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-pp', '2'))
    const list = await listVideos(page, UC, { urls, limit: 3 })
    assert.equal(list.length, 3)
    assert.equal(list[1].id, VID)
  }],

  ['chon so video quet: qua nhieu trang, toi da bang so video co trong kenh', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
    await page.eval(() => localStorage.setItem('opt-pp', '3'))
    const five = await listVideos(page, UC, { urls, limit: 5 })
    assert.deepEqual(five.map((v) => v.id), ['Prem0000001', VID, 'LostTribe01', 'NeverProp01', 'Maccabee001'], 'doc sang trang 2, dung 5')
    const all = await listVideos(page, UC, { urls, limit: 50, maxPages: 10 })
    assert.equal(all.length, 7, 'kenh chi co 7 video')
    assert.equal(all[6].id, 'HonorPar001', 'doc ca trang 3')
    await page.eval(() => localStorage.removeItem('opt-pp'))
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
    assert.deepEqual(d.playlists, ['PLa', 'PLb', 'PLc'], 'tich ca 2 danh sach trung ten (1 Podcast) + tu chon 3 danh sach dau (PLc), khong tich "Sermons"')
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
    assert.deepEqual(again.warnings, [], 'video da co man hinh ket thuc: coi nhu xong, khong canh bao')
    assert.deepEqual(await events(mock, 'save'), [])
  }],

  ['mot muc loi (khong thay muc AI) va vi tri khong co goi y: bao canh bao, cac muc khac van luu', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/video/${VID}/edit`)
    await page.eval(() => localStorage.setItem('opt-noai', '1'))
    page.timeout = 3000
    const r = await optimizeVideo(page, VID, { ...defaultTemplate(), location: 'Atlantis' }, { urls, now: NOW })
    await page.eval(() => localStorage.removeItem('opt-noai'))
    assert.equal(r.saved, true)
    assert.deepEqual(r.changed, ['playlists', 'paidPromotion', 'tags', 'recordingDate', 'remix', 'endScreen'])
    assert.match(r.warnings.join('\n'), /Bỏ qua mục "Sử dụng AI": Quá 3 giây vẫn chưa thấy mục "Sử dụng AI"/)
    assert.match(r.warnings.join('\n'), /Không thấy "Atlantis" trong gợi ý vị trí, giữ nguyên vị trí/)
    const [save] = await events(mock, 'save')
    assert.equal(save.data.remix, 'Không cho phép phối lại')
    assert.equal(save.data.location, '', 'vi tri cu (trong) duoc giu')
    assert.equal(await page.value({ selector: '#location input' }), '', 'chu "Atlantis" khong con trong o')
  }],

  ['ngay quay: Studio khong nhan ngay go vao o -> chon tren lich (lui thang)', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/video/${VID}/edit`)
    await page.eval(() => localStorage.setItem('opt-quirks', JSON.stringify({ dateTyping: false })))
    try {
      const r = await optimizeVideo(page, VID, { ...KEEP, recordingDate: 'publish' }, { urls, now: NOW, video: { date: '3 thg 7, 2026' } })
      assert.deepEqual([r.changed, r.warnings], [['recordingDate'], []])
      const [save] = await events(mock, 'save')
      assert.equal(save.data.recDate, '3 thg 7, 2026')
    } finally { await page.eval(() => localStorage.removeItem('opt-quirks')) }
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

  ['"Hiện thêm" bam lan dau bi mat: bam lai roi moi toi uu', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/video/${VID}/edit`)
    await page.eval(() => localStorage.setItem('opt-moreflaky', 'true'))
    try {
      const r = await optimizeVideo(page, VID, { ...KEEP, remix: 'none' }, { urls, now: NOW })
      assert.deepEqual([r.changed, r.warnings], [['remix'], []])
      const [save] = await events(mock, 'save')
      assert.equal(save.data.remix, 'Không cho phép phối lại')
    } finally { await page.eval(() => localStorage.removeItem('opt-moreflaky')) }
  }],

  ['Studio tieng Anh: van mo "Show more" va toi uu, ngay quay viet kieu tieng Anh', async ({ page, urls, mock }) => {
    await page.goto(`${urls.studio}/video/${VID}/edit`)
    await page.eval(() => localStorage.setItem('opt-english', 'true'))
    try {
      const logs = []
      const r = await optimizeVideo(page, VID, { ...KEEP, remix: 'none', recordingDate: 'today' }, { urls, now: NOW, log: (l, m) => logs.push(`${l} ${m}`) })
      assert.deepEqual([r.changed, r.warnings], [['recordingDate', 'remix'], []], logs.join('\n'))
      assert(logs.some((l) => /đang dùng tiếng Anh/.test(l)))
      const [save] = await events(mock, 'save')
      assert.equal(save.data.remix, 'Không cho phép phối lại')
      const i = await inspectVideo(page, VID, defaultTemplate(), { urls, now: NOW })
      assert.deepEqual(i.notes, [])
    } finally { await page.eval(() => localStorage.removeItem('opt-english')) }
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

  ['trang xem video chi tai binh luan khi cua so chay ngam duoc hien (Windows): hien trong luc lam roi an lai', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-needshow': true, 'opt-shown': false })
    const calls = []
    page.show = async () => {
      calls.push('show')
      await page.eval(() => localStorage.setItem('opt-shown', 'true'))
      return async () => { calls.push('hide'); await page.eval(() => localStorage.setItem('opt-shown', 'false')) }
    }
    try {
      const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH, like: false, pin: false })
      assert.deepEqual([r.posted, r.commented, r.warnings], [true, true, []])
      assert.deepEqual(calls, ['show', 'hide'])
      assert.equal((await events(mock, 'comment')).length, 1)
    } finally {
      page.show = null
      await flags(page, urls, { 'opt-needshow': false })
    }
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

  ['chu kenh xem video cua minh: nut "Thích" / "Bỏ thích" (giong that/xem-da-ghim.html)', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-ownerlike': true })
    const logs = []
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH, log: (l, m) => logs.push(`${l} ${m}`) })
    assert.deepEqual([r.liked, r.commented, r.pinned, r.warnings], [true, true, true, []], logs.join('\n'))
    assert.deepEqual((await events(mock, 'like')).map((e) => e.liked), [true])
    assert.equal(await page.eval(() => document.querySelector('#like').getAttribute('aria-label')), 'Bỏ thích')
  }],

  ['khong thay nut Thich: van binh luan + ghim, bao chua thich', async ({ page, urls, mock }) => {
    await flags(page, urls, { 'opt-nolike': true })
    const logs = []
    const r = await commentAndPin(page, VID, TITLE, { urls, channel: CH, log: (l, m) => logs.push(`${l} ${m}`) })
    assert.deepEqual([r.liked, r.commented, r.pinned], [false, true, true], logs.join('\n'))
    assert.match(r.warnings.join('\n'), /Chưa thích được video: Không thấy nút "Thích"/)
    assert.equal((await events(mock, 'comment')).length, 1)
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
  // cong chieu: chua thich / binh luan / ghim duoc -> van "chua toi uu" (lan sau lam tiep)
  assert.deepEqual(S.videos.slice(0, 2).map((v) => v.status), ['new', 'done'], logs.join('\n'))
  assert.match(S.videos[0].warnings.join(' '), /Đang công chiếu/, 'cong chieu: khong binh luan')
  assert.deepEqual(S.videos[0].missing, ['thích', 'bình luận', 'ghim'])
  assert.deepEqual((await events(mock, 'comment')).map((e) => e.text), [`${TITLE} | Dark Bible Study`])
  const db = JSON.parse(fs.readFileSync(path.join(tmp, 'optimized.json'), 'utf8'))
  assert.deepEqual(Object.keys(db[UC]).sort(), ['Prem0000001', VID].sort())
  assert.deepEqual([db[UC][VID].liked, db[UC][VID].commented, db[UC][VID].pinned, db[UC][VID].missing], [true, true, true, []], 'luu dung ket qua da kiem lai')
  assert.deepEqual(S.videos.find((v) => v.id === VID).missing, [])
  // quet lai: video da toi uu "Da toi uu"; video cong chieu van thieu viec o trang xem video (lay tu db)
  await f.commands.optimize_list(UC)
  assert.equal(S.videos.find((v) => v.id === VID).status, 'done')
  assert.deepEqual(S.videos.find((v) => v.id === 'Prem0000001').missing.slice(-3), ['thích', 'bình luận', 'ghim'])
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
  // ghim khong an tren YouTube: khong bao thanh cong gia -> "chua toi uu", thieu "ghim" (lan sau ghim lai)
  await flags(page, urls, { 'opt-pinfail': 'silent' })
  f.commands.optimize_template_save({ channelKey: UC, template: { ...KEEP, like: true, comment: 'Ghim thử {tieu_de}', pin: true } })
  await f.commands.optimize_run({ channelKey: UC, ids: ['TheCross001'] })
  const tc = S.videos.find((v) => v.id === 'TheCross001')
  assert.deepEqual([tc.status, tc.missing], ['new', ['ghim']], logs.slice(-6).join('\n'))
  const dbx = JSON.parse(fs.readFileSync(path.join(tmp, 'optimized.json'), 'utf8'))[UC].TheCross001
  assert.deepEqual([dbx.liked, dbx.commented, dbx.pinned, dbx.missing], [true, true, false, ['ghim']])
  assert.match(logs.join('\n'), /chưa ghim được \(đã kiểm lại trên trang xem video\)/)
  assert.match(logs[logs.length - 1], /^warn Xong: tối ưu được 1\/1 video, 1 video chưa thích \/ bình luận \/ ghim được/)
  // khong co withChannel -> bao loi ro rang
  ctx.withChannel = null
  await f.commands.optimize_list(UC)
  assert.match(logs[logs.length - 1], /Chưa có tài khoản Google nào/)
}])

// ---- tu chon danh sach phat + quet (chi doc) ----
module.exports.push(['tu chon 3 danh sach phat dau tien (da tich san van tinh), khong tich danh sach thu 4', async ({ page, urls, mock }) => {
  await page.goto(`${urls.studio}/video/${VID}/edit`)
  await page.eval(() => OPT.save('opt-video-vyiSqHByq24', { ...OPT.fresh(), desc: 'Có mô tả', playlists: ['PLb'] }))
  const r = await optimizeVideo(page, VID, { ...KEEP, playlistAuto: 3 }, { urls, now: NOW })
  assert.deepEqual([r.changed, r.saved, r.warnings], [['playlists'], true, []])
  const [save] = await events(mock, 'save')
  assert.deepEqual(save.data.playlists, ['PLa', 'PLb', 'PLc'], 'PLb da tich tinh vao 3, khong tich PLd')
  assert.equal(await page.text({ selector: '#pl-trigger .dropdown-trigger-text' }), '3 danh sách phát')
  mock.events.length = 0
  const two = await optimizeVideo(page, VID, { ...KEEP, playlistAuto: 2 }, { urls, now: NOW })
  assert.deepEqual([two.changed, two.saved], [[], false], 'du roi -> khong bam gi')
  assert.deepEqual(await events(mock, 'save'), [])
}])

module.exports.push(['quet: video da dien du -> khong thieu muc nao, khong doi gi', async ({ page, urls, mock }) => {
  const steps = []
  const t0 = Date.now()
  const r = await inspectVideo(page, 'DoneVideo01', defaultTemplate(), { urls, onStep: (s) => steps.push(s) })
  const ms = Date.now() - t0
  console.log('quet 1 video:', ms, 'ms', JSON.stringify(r.read))
  assert.deepEqual(r.missing, [], JSON.stringify(r))
  assert.deepEqual(r.filled, ['playlists', 'paidPromotion', 'ai', 'remix', 'tags', 'recordingDate', 'location'])
  assert.deepEqual(r.unknown, ['endScreen'], 'trang Chi tiet khong cho biet man hinh ket thuc')
  assert.deepEqual(r.notes, [])
  assert.equal(r.read.playlists.count, 3)
  assert.equal(r.read.playlists.items, undefined, 'du 3 danh sach -> khong can mo hop thoai')
  assert.equal(r.read.recordingDate, '2 thg 8, 2026')
  assert(ms < 6000, `qua cham: ${ms} ms`)
  assert(steps.includes('Đọc thông tin'))
  assert.deepEqual(await events(mock, 'save'), [])
  assert.equal(await page.eval(() => document.querySelector('#save').getAttribute('aria-disabled')), 'true', 'khong co thay doi')
}])

module.exports.push(['quet: video moi -> danh sach muc con thieu (mo hop thoai danh sach phat roi dong)', async ({ page, urls, mock }) => {
  const tpl = { ...defaultTemplate(), description: 'Mô tả {tieu_de}', language: 'Tiếng Việt', category: '22', comments: 'on', license: 'creativeCommon', embeddable: 'yes', endScreen: 'keep' }
  const r = await inspectVideo(page, VID, tpl, { urls })
  assert.deepEqual(r.missing, ['playlists', 'paidPromotion', 'ai', 'remix', 'tags', 'language', 'recordingDate', 'location'], JSON.stringify(r))
  assert.deepEqual(r.filled, ['description', 'comments', 'license', 'embeddable', 'category'], 'giay phep bi khoa -> khong tinh la thieu')
  assert.deepEqual(r.unknown, [])
  assert.equal(r.title, TITLE)
  assert.deepEqual([r.read.playlists.text, r.read.playlists.count, r.read.playlists.items.length], ['Chọn', 0, 4])
  assert.deepEqual([r.read.paidPromotion, r.read.ai, r.read.remix, r.read.recordingDate, r.read.location], ['', '', 'all', '', ''])
  assert.deepEqual(r.read.license, { value: 'youtube', locked: true })
  assert.equal(await page.count({ selector: 'ytcp-playlist-dialog' }), 0, 'hop thoai da dong')
  assert.deepEqual(await events(mock, 'save'), [])
  assert.equal(await page.eval(() => document.querySelector('#save').getAttribute('aria-disabled')), 'true', 'chi doc: khong co thay doi')
  // sau khi toi uu theo mau -> quet lai khong con thieu (tru muc mau khong lam duoc)
  await optimizeVideo(page, VID, { ...tpl, endScreen: 'keep' }, { urls, now: NOW })
  const again = await inspectVideo(page, VID, tpl, { urls })
  assert.deepEqual(again.missing, [], JSON.stringify(again))
  // mau co ten danh sach phat: 1 danh sach tich + ten khac chua tich -> thieu
  await page.eval(() => OPT.save('opt-video-LostTribe01', { ...OPT.fresh(), desc: 'x', playlists: ['PLa'] }))
  const named = await inspectVideo(page, 'LostTribe01', { ...KEEP, playlists: ['Sermons'] }, { urls })
  assert.deepEqual(named.missing, ['playlists'])
}])

module.exports.push(['quet: muc doc loi -> tinh la thieu kem ghi chu', async ({ page, urls }) => {
  await page.goto(`${urls.studio}/video/DoneVideo02/edit`)
  await page.eval(() => localStorage.setItem('opt-noai', '1'))
  page.timeout = 3000
  const r = await inspectVideo(page, 'DoneVideo02', defaultTemplate(), { urls })
  await page.eval(() => localStorage.removeItem('opt-noai'))
  assert.deepEqual(r.missing, ['ai'])
  assert.match(r.notes.join('\n'), /Không đọc được mục "ai"/)
}])

// Quet trong tinh nang: danh dau trang thai tung video, "toi uu tat ca chua toi uu" chi chay video con thieu.
module.exports.push(['tinh nang: quet doc tung video, chi toi uu video con thieu', async ({ page, urls, mock, tmp }) => {
  const path = require('path')
  const logs = []
  const steps = new Set()
  let saved = {}
  const state = { f: {} }
  const ctx = {
    state, log: (l, m) => logs.push(`${l} ${m}`), logFile: (n) => path.join(tmp, n), urls,
    push: () => { for (const v of (state.f.optimize && state.f.optimize.videos) || []) if (v.step) steps.add(v.step) },
    store: { get settings() { return saved }, save: (p) => { saved = { ...saved, ...p } } }, refreshSettings: () => {},
    stopped: () => false, resetStop: () => {},
    accounts: { channels: () => [{ key: UC, ucId: UC, name: 'Dark Bible Study', handle: '@DarkBibleStudy999' }], find: (k) => (k === UC ? { key: UC, ucId: UC, name: 'Dark Bible Study' } : null) },
    withChannel: async (key, fn) => fn(page),
  }
  // 4 video da dien du, NeverProp01 thieu, Maccabee001 trang loi, VID moi
  await page.goto(`${urls.studio}/video/${VID}/edit`)
  await page.eval(() => {
    for (const id of ['Prem0000001', 'LostTribe01', 'TheCross001', 'HonorPar001']) OPT.save('opt-video-' + id, { ...OPT.optimized(OPT.videoOf(id)), desc: 'x' })
    OPT.save('opt-video-NeverProp01', { ...OPT.optimized(OPT.videoOf('NeverProp01')), desc: 'x', location: '', playlists: ['PLa'] })
    localStorage.setItem('opt-broken', 'Maccabee001')
  })
  page.timeout = 4000
  const f = require('../../src/features/optimize')(ctx)
  f.start()
  const S = state.f.optimize
  f.commands.optimize_template_save({ channelKey: UC, template: { ...defaultTemplate(), comment: '', like: false } })
  const t0 = Date.now()
  await f.commands.optimize_list(UC)
  console.log('quet 7 video:', Date.now() - t0, 'ms')
  const by = Object.fromEntries(S.videos.map((v) => [v.id, v]))
  assert.deepEqual(S.videos.map((v) => v.status), ['done', 'new', 'done', 'new', 'new', 'done', 'done'], JSON.stringify(S.videos.map((v) => [v.id, v.status, v.missing, v.note])))
  assert.deepEqual(by[VID].missing, ['playlists', 'paidPromotion', 'ai', 'remix', 'tags', 'recordingDate', 'location'])
  assert.deepEqual(by.NeverProp01.missing, ['playlists', 'location'])
  assert.match(by.Maccabee001.note, /Không đọc được trang Chi tiết/)
  assert(steps.has('Đang đọc 1/7…') && steps.has('Đang đọc 7/7…'), [...steps].join(', '))
  assert(S.videos.every((v) => !v.step))
  assert.match(logs.join('\n'), /7 video, 3 chưa tối ưu/)
  await page.goto(`${urls.studio}/video/${VID}/edit`)
  await page.eval(() => localStorage.removeItem('opt-broken'))
  // "toi uu tat ca chua toi uu": chi 3 video con thieu
  mock.events.length = 0
  await f.commands.optimize_run({ channelKey: UC })
  const saves = (await events(mock, 'save')).map((e) => e.id)
  assert.deepEqual(saves, [VID, 'NeverProp01', 'Maccabee001'], logs.slice(-6).join('\n'))
  assert(S.videos.every((v) => v.status === 'done'), JSON.stringify(S.videos.map((v) => [v.id, v.status, v.missing, v.warnings])))
  // mo lai trang: giu trang thai cua lan quet / toi uu
  f.commands.optimize_open()
  assert(S.videos.every((v) => v.status === 'done'))
}])

module.exports.push(['tinh nang: chon so video quet (luu cai dat), bam tieu de mo trang chinh sua video', async ({ page, urls, tmp }) => {
  const path = require('path')
  const logs = []
  const opened = []
  let saved = { optimizeScanLimit: 20 }
  const state = { f: {} }
  const ctx = {
    state, log: (l, m) => logs.push(`${l} ${m}`), logFile: (n) => path.join(tmp, n), urls, push: () => {},
    store: { get settings() { return saved }, save: (p) => { saved = { ...saved, ...p } } }, refreshSettings: () => {},
    stopped: () => false, resetStop: () => {},
    accounts: {
      channels: () => [{ key: UC, ucId: UC, name: 'Dark Bible Study', handle: '@DarkBibleStudy999' }],
      find: (k) => (k === UC ? { key: UC, ucId: UC, name: 'Dark Bible Study' } : null),
      openUrl: async (p) => { opened.push(p) },
    },
    withChannel: async (key, fn) => fn(page),
  }
  await page.goto(`${urls.studio}/channel/${UC}/videos/upload`)
  await page.eval(() => localStorage.setItem('opt-pp', '3'))
  page.timeout = 4000
  const f = require('../../src/features/optimize')(ctx)
  f.start()
  const S = state.f.optimize
  assert.equal(S.limit, 20, 'doc tu cai dat')
  assert.deepEqual(S.limits, [5, 10, 20, 30, 50])
  f.commands.optimize_limit('abc')
  assert.deepEqual([S.limit, saved.optimizeScanLimit], [10, 10], 'gia tri la -> mac dinh 10')
  await f.commands.optimize_list({ channelKey: UC, limit: 5 })
  assert.equal(saved.optimizeScanLimit, 5, 'luu so video da chon')
  assert.deepEqual(S.videos.map((v) => v.id), ['Prem0000001', VID, 'LostTribe01', 'NeverProp01', 'Maccabee001'], 'chi 5 video, qua 2 trang')
  assert.match(logs.join('\n'), /: 5 video/)
  // mo lai trang: giu so da chon
  f.commands.optimize_open()
  assert.equal(S.limit, 5)
  // bam tieu de: mo trang chinh sua video trong khung Studio, dung kenh
  await f.commands.optimize_open_video({ channelKey: UC, id: VID })
  assert.deepEqual(opened, [{ channelKey: UC, url: `${urls.studio}/video/${VID}/edit` }])
  await f.commands.optimize_open_video({ channelKey: UC, id: '' })
  assert.equal(opened.length, 1, 'khong ro video thi khong mo')
}])
