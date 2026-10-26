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
const KEEP = { playlists: [], paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', extraTags: [], location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', category: 'keep', language: '', comments: 'keep', license: 'keep', embeddable: 'keep', like: false, comment: '', pin: false }

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

  ['thich + binh luan + ghim; chay lai khong dang lai', async ({ page, urls, mock }) => {
    const r = await commentAndPin(page, VID, TITLE, { urls })
    assert.deepEqual([r.liked, r.commented, r.pinned, r.warnings], [true, true, true, []])
    assert.deepEqual((await events(mock, 'comment')).map((e) => e.text), [TITLE])
    assert.equal((await events(mock, 'pin')).length, 1)
    assert.deepEqual((await events(mock, 'like')).map((e) => e.liked), [true])
    assert(await page.has('Đã ghim bình luận'))
    mock.events.length = 0
    const again = await commentAndPin(page, VID, TITLE, { urls })
    assert.deepEqual([again.liked, again.commented, again.pinned], [true, false, true])
    assert.deepEqual([await events(mock, 'comment'), await events(mock, 'pin'), await events(mock, 'like')], [[], [], []], 'khong binh luan, ghim, bam thich lai')
  }],

  ['ghim loi -> giu binh luan + canh bao; lan sau chi ghim', async ({ page, urls, mock }) => {
    await page.goto(`${urls.youtube}/watch?v=${VID}`)
    await page.eval(() => localStorage.setItem('opt-nopin', '1'))
    const text = `${TITLE}\nXem lại: https://youtu.be/${VID}`
    const r = await commentAndPin(page, VID, text, { urls, like: false })
    assert.deepEqual([r.liked, r.commented, r.pinned], [false, true, false])
    assert.match(r.warnings[0], /Đã bình luận nhưng chưa ghim được/)
    assert.deepEqual(await events(mock, 'like'), [])
    assert.equal((await events(mock, 'comment')).length, 1)
    mock.events.length = 0
    await page.eval(() => localStorage.removeItem('opt-nopin'))
    const again = await commentAndPin(page, VID, text, { urls, like: false })
    assert.deepEqual([again.commented, again.pinned, again.warnings], [false, true, []])
    assert.deepEqual(await events(mock, 'comment'), [])
    assert.equal((await events(mock, 'pin')).length, 1)
  }],

  ['khong ghim khi tat; binh luan rong thi chi thich', async ({ page, urls, mock }) => {
    const r = await commentAndPin(page, VID, 'Cảm ơn mọi người đã xem!', { urls, pin: false })
    assert.deepEqual([r.commented, r.pinned], [true, false])
    assert.deepEqual(await events(mock, 'pin'), [])
    mock.events.length = 0
    const only = await commentAndPin(page, 'LostTribe01', '', { urls })
    assert.deepEqual([only.liked, only.commented], [true, false])
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
  assert.equal(db[UC][VID].pinned, true)
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
  // khong co withChannel -> bao loi ro rang
  ctx.withChannel = null
  await f.commands.optimize_list(UC)
  assert.match(logs[logs.length - 1], /Chưa có tài khoản Google nào/)
}])
