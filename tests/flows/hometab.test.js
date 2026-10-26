// Bai kiem cho src/flows/hometab.js tren trang gia tests/mock-yt/hometab
const assert = require('assert')
const flow = require('../../src/flows/hometab')
const { parseChannelInput, parsePlaylistInput } = require('../../src/hometab-input')
const { NEW, PLAYLIST, CHANNELS } = require('../mock-yt/hometab/fixtures')

const input = (ch, extra = {}) => ({
  ucId: ch.ucId, target: { ucId: ch.ucId },
  channel: parseChannelInput(`https://www.youtube.com/channel/${NEW.ucId}`),
  playlist: parsePlaylistInput(`https://www.youtube.com/playlist?list=${PLAYLIST.id}`),
  doChannel: true, doPlaylist: true, position: 0, searchTimeout: 3000, ...extra,
})
const run = (page, urls, inp, logs = []) => flow.updateHomeTab(page, inp, { urls, log: (l, m) => logs.push(`${l} ${m}`) })
const publishes = (mock) => mock.events.filter((e) => e.type === 'publish')

// ctx gia cho src/features/hometab.js: withChannel chay ngay tren trang cua bai kiem
function fakeCtx(page, urls, { withChannel = true, stopAfter = 99 } = {}) {
  const logs = []
  let calls = 0
  const accounts = [CHANNELS.grace, CHANNELS.already, CHANNELS.self, CHANNELS.nofeat].map((c) => ({ key: c.ucId, accountId: 'a1', ucId: c.ucId, name: c.name, handle: '' }))
  const ctx = {
    state: { f: { accounts: { list: [{ id: 'a1', channels: accounts }] } } }, push() {}, log: (l, m) => logs.push(`${l} ${m}`), urls, store: null,
    stopped: () => calls >= stopAfter, resetStop() {}, isBusy: () => false, setBusy() {},
    withChannel: withChannel ? async (key, fn) => { calls++; return fn(page) } : null,
  }
  ctx.logs = logs
  return ctx
}

module.exports = [
  ['doc bo cuc: so phan, Kenh noi bat, danh sach phat don', async ({ page, urls }) => {
    const lay = await flow.openHomeTab(page, { ucId: CHANNELS.grace.ucId }, { urls })
    assert.equal(lay.sections.length, 7)
    assert.equal(lay.limit, 12)
    assert.equal(lay.homeTabOn, true)
    assert.deepEqual(lay.sections.map((s) => s.kind), ['featured', 'playlist', 'playlist', 'other', 'other', 'other', 'other'])
    assert.equal(lay.sections[0].title, 'Kênh nổi bật:(3)', 'h2#label khong co khoang trang, nhu HTML that')
    assert.equal(lay.sections[0].count, 3)
    assert.equal(lay.sections[1].name, 'Bible - in a Nutshell')
    assert.equal(lay.sections[1].count, 12)
  }],

  ['them kenh vao phan Kenh noi bat co san (⋮ → Chinh sua) roi xuat ban', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.grace, { doPlaylist: false }))
    assert.deepEqual(r.errors, [])
    assert.equal(r.channel.status, 'added')
    assert.equal(r.channel.name, 'Dark Bible Genesis')
    assert.equal(r.channel.created, false)
    assert.equal(r.published, true)
    const p = publishes(mock)
    assert.equal(p.length, 1)
    assert.deepEqual(p[0].featured, ['Dark Bible Study', 'Dark Bible - in a Nutshell', 'Dark Biblical Realm', 'Dark Bible Genesis'])
    assert.equal(p[0].sections[0], 'Kênh nổi bật: (4)')
    assert.equal(await page.has('Đã áp dụng nội dung thay đổi'), true)
  }],

  ['chua co Kenh noi bat: tao phan moi qua "+ Them phan kenh"', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.nofeat, { doPlaylist: false }))
    assert.deepEqual(r.errors, [])
    assert.equal(r.channel.status, 'added')
    assert.equal(r.channel.created, true)
    const p = publishes(mock)
    assert.equal(p.length, 1)
    assert.equal(p[0].sections.length, 5)
    assert.equal(p[0].sections[4], 'Kênh nổi bật: (1)')
  }],

  ['kenh va danh sach phat da co san: bo qua, khong bo tich, khong xuat ban', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.already))
    assert.deepEqual(r.errors, [])
    assert.equal(r.channel.status, 'already')
    assert.equal(r.playlist.status, 'already')
    assert.equal(r.playlist.title, 'Dark Bible Genesis')
    assert.equal(r.published, false)
    assert.equal(publishes(mock).length, 0)
    assert.equal(await page.eval(() => document.querySelector('#publish-button button').disabled), true, 'khong co thay doi nao')
    assert.equal(await page.eval(() => !!document.querySelector('.scrim')), false, 'hop thoai da dong')
  }],

  ['kenh dich chinh la kenh moi: bo qua buoc Kenh noi bat', async ({ page, urls }) => {
    const logs = []
    const r = await run(page, urls, input(CHANNELS.self, { doPlaylist: false }), logs)
    assert.equal(r.channel.status, 'self')
    assert.equal(r.published, false)
    assert(logs.some((l) => /chính là kênh mới/.test(l)))
  }],

  ['them Danh sach phat don (o tim ben phai, bam o ket qua) roi xuat ban', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.grace, { doChannel: false }))
    assert.deepEqual(r.errors, [])
    assert.equal(r.playlist.status, 'added')
    assert.equal(r.playlist.title, 'Dark Bible Genesis')
    assert.equal(r.playlist.index, 7)
    assert.equal(r.moved, null)
    const p = publishes(mock)
    assert.equal(p.length, 1)
    assert.equal(p[0].sections.length, 8)
    assert.equal(p[0].sections[7], 'Danh sách phát đơn: Dark Bible Genesis (1)')
  }],

  ['ca hai viec, dat danh sach phat o vi tri 4 (keo-tha HTML5 len vach giua cac phan), xuat ban mot lan', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.grace, { position: 4 }))
    assert.deepEqual(r.errors, [])
    assert.equal(r.channel.status, 'added')
    assert.equal(r.playlist.status, 'added')
    assert.equal(r.moved, true)
    const p = publishes(mock)
    assert.equal(p.length, 1)
    assert.deepEqual(p[0].sections.slice(0, 5), ['Kênh nổi bật: (4)', 'Danh sách phát đơn: Bible - in a Nutshell (12)', 'Danh sách phát đơn: Dark Bible Study (7)', 'Danh sách phát đơn: Dark Bible Genesis (1)', 'Video (21)'])
    assert(mock.events.some((e) => e.type === 'drag' && e.mode === 'html5'))
  }],

  ['danh sach sap xep bang chuot (khong co HTML5): keo ≡ bang chuot that', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.mouse, { doChannel: false, position: 2 }))
    assert.deepEqual(r.errors, [])
    assert.equal(r.moved, true)
    const p = publishes(mock)
    assert.equal(p[0].sections[1], 'Danh sách phát đơn: Dark Bible Genesis (1)')
    assert(mock.events.some((e) => e.type === 'drag' && e.mode === 'mouse'))
  }],

  ['phan khong co so dem (Ghi nhan hoi vien) van duoc tinh', async ({ page, urls }) => {
    const lay = await flow.openHomeTab(page, { ucId: CHANNELS.nofeat.ucId }, { urls })
    assert.deepEqual(lay.sections.map((s) => [s.title, s.count]), [['Ghi nhận hội viên', null], ['Danh sách phát đơn:Bible - in a Nutshell(12)', 12], ['Video(40)', 40], ['Bài đăng(3)', 3]])
    assert.equal(lay.sections[1].name, 'Bible - in a Nutshell')
  }],

  ['da du 12 phan: bao loi ro rang cho danh sach phat, van them kenh va xuat ban', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.full))
    assert.equal(r.channel.status, 'added')
    assert.equal(r.playlist.status, 'error')
    assert.match(r.playlist.error, /đã có 12\/12 phần kênh/)
    assert.equal(r.published, true)
    assert.equal(publishes(mock)[0].sections.length, 12)
  }],

  ['menu "Them phan kenh" bi lam mo: bao loi', async ({ page, urls }) => {
    await flow.openHomeTab(page, { ucId: CHANNELS.grace.ucId }, { urls })
    // lam mo muc "Danh sach phat don" (gia lap gioi han ma so phan chua toi 12)
    await page.eval(() => { const o = window.openMenu; window.openMenu = (a, items) => o(a, items.map((it) => (it.label === 'Danh sách phát đơn' ? { ...it, disabled: true } : it))) })
    await assert.rejects(flow.addPlaylistSection(page, input(CHANNELS.grace)), /đang bị làm mờ/)
  }],

  ['khong tim thay kenh / danh sach phat: bao loi, dong hop thoai', async ({ page, urls, mock }) => {
    const r = await run(page, urls, input(CHANNELS.grace, {
      channel: parseChannelInput('UCkhongCoKenhNay000000000'.slice(0, 24)),
      playlist: parsePlaylistInput('PLkhongCoDanhSachNay0000000'),
    }))
    assert.equal(r.channel.status, 'error')
    assert.match(r.channel.error, /Không tìm thấy kênh/)
    assert.equal(r.playlist.status, 'error')
    assert.match(r.playlist.error, /Không tìm thấy danh sách phát/)
    assert.equal(r.published, false)
    assert.equal(publishes(mock).length, 0)
    assert.equal(await page.eval(() => !!document.querySelector('.scrim')), false)
  }],

  ['tinh nang: chay qua nhieu kenh, bo qua kenh moi, trang thai tung kenh', async ({ page, urls, mock }) => {
    const ctx = fakeCtx(page, urls)
    const f = require('../../src/features/hometab')(ctx)
    f.start()
    const S = ctx.state.f.hometab
    assert.equal(S.channels.length, 4)
    await f.commands.hometab_save_input({ channelUrl: '@biblegenesis9999', playlistUrl: PLAYLIST.id, position: '' })
    assert.equal(S.check.ok, true)
    await f.commands.hometab_save_input({ channelUrl: `https://www.youtube.com/channel/${NEW.ucId}` })
    assert.equal(S.newKey, NEW.ucId, 'kenh moi nam trong tai khoan')
    await f.commands.hometab_run({ targets: [CHANNELS.grace.ucId, CHANNELS.self.ucId, CHANNELS.already.ucId] })
    assert.deepEqual(S.targets.map((t) => [t.name, t.status]), [['Dark Grace', 'done'], ['Dark Bible Mysteries', 'skipped']])
    assert.equal(S.targets[0].channel, 'added')
    assert.equal(S.targets[0].playlist, 'added')
    assert.equal(S.targets[1].channel, 'already')
    assert.equal(S.busy, false)
    assert(ctx.logs.some((l) => /Bỏ qua "Dark Bible Genesis": đây chính là kênh mới/.test(l)), ctx.logs.join('\n'))
    assert(ctx.logs.some((l) => /xong 2\/2 kênh/.test(l)))
    assert.equal(publishes(mock).length, 1)
  }],

  ['tinh nang: loi dau vao, chua co tai khoan, dung giua chung', async ({ page, urls }) => {
    let ctx = fakeCtx(page, urls)
    let f = require('../../src/features/hometab')(ctx)
    f.start()
    await f.commands.hometab_run({ targets: [CHANNELS.grace.ucId], channelUrl: 'abc', playlistUrl: '' })
    assert(ctx.logs.some((l) => /error Trang chủ kênh: Không phải link YouTube/.test(l)))
    assert(ctx.logs.some((l) => /Chưa nhập link danh sách phát/.test(l)))
    assert.equal(ctx.state.f.hometab.targets.length, 0)

    ctx = fakeCtx(page, urls, { withChannel: false })
    f = require('../../src/features/hometab')(ctx)
    f.start()
    await f.commands.hometab_run({ targets: [CHANNELS.grace.ucId], channelUrl: NEW.ucId, playlistUrl: PLAYLIST.id })
    assert(ctx.logs.some((l) => /Chưa có tài khoản Google nào \(trang Tài khoản\)/.test(l)))

    ctx = fakeCtx(page, urls, { stopAfter: 1 })
    f = require('../../src/features/hometab')(ctx)
    f.start()
    await f.commands.hometab_run({ targets: [CHANNELS.already.ucId, CHANNELS.grace.ucId], channelUrl: NEW.ucId, playlistUrl: PLAYLIST.id })
    assert.deepEqual(ctx.state.f.hometab.targets.map((t) => t.status), ['skipped', 'stopped'])
  }],

  ['HTML that (yt-9): doc bo cuc, nut ⋮, tay keo HTML5, menu, hop thoai danh sach phat', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/that-hometab/yt9`, { wait: 'Thêm phần kênh' })
    const lay = await flow.readLayout(page)
    assert.equal(lay.limit, 12)
    const titles = lay.sections.map((s) => [s.kind, s.count])
    assert.deepEqual(titles, [['featured', 1], ['other', null], ['other', 62], ['other', 2], ['other', 0], ['other', 0]], JSON.stringify(lay.sections))
    assert.equal(lay.sections[1].title, 'Ghi nhận hội viên')
    const L = (fn, ...a) => page.eval(`(n, a) => { ${flow._install}; return window.__yaHome[n](...a) }`, fn, a)
    assert.equal(await L('markKebab', 0), true)
    assert.equal(await page.eval(() => document.querySelector('[data-yah="kebab"]').getAttribute('aria-label')), 'Tùy chọn về ')
    assert.equal(await L('html5', 2), true, '.maybe-draggable')
    assert(await L('handle', 2), 'tay keo .drag-handle-container')
    // phan "Danh sach phat don" moi (con an) da tinh la thay doi: nut Xuat ban bat
    assert.deepEqual(await L('button', flow.LABELS.publish), { found: true, disabled: false })
    assert.deepEqual(await L('item', flow.LABELS.menuSinglePlaylist), { found: true, disabled: false })
    assert.deepEqual(await L('item', '^danh sách phát đã tạo$'), { found: true, disabled: true })
    assert.equal(await L('dialogOpen'), true)
    assert.equal(await page.has({ text: 'Danh sách phát bất kỳ trên YouTube', regex: flow.LABELS.anyPlaylist, within: { selector: flow.SEL.dialog } }), true)
    const tiles = await L('tiles')
    assert.equal(tiles.length, 1)
    assert.equal(tiles[0].title, 'LIVE')
    assert.equal(tiles[0].count, 0)
  }],

  ['HTML that (yt-8): hop thoai Kenh noi bat', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/that-hometab/yt8`, { wait: 'Thêm phần kênh' })
    const L = (fn, ...a) => page.eval(`(n, a) => { ${flow._install}; return window.__yaHome[n](...a) }`, fn, a)
    assert.equal(await page.has({ text: 'Một kênh YouTube bất kỳ', regex: flow.LABELS.channelSearch, within: { selector: flow.SEL.dialog } }), true)
    assert.deepEqual(await L('sectionChannels'), [])
    assert.deepEqual(await L('channelRows'), [])
    assert.equal(await L('noResult'), false, '#no-match-message dang an')
    assert.deepEqual(await L('item', flow.LABELS.done), { found: true, disabled: true }, 'Xong bi khoa khi chua doi gi')
  }],
]
