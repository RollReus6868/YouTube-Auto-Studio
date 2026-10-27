// Chay that app voi Studio gia (tests/mock-yt): phien 0.3 thanh "Tai khoan 1", du lieu YouTube API cu bi bo,
// them tai khoan -> dang nhap trong khung -> "Xong, dong lai" -> doc kenh -> tick kenh ->
// ctx.withChannel (cua so an, chuyen kenh, kiem UC) -> khung Studio theo kenh chon ->
// kenh dang video (trang Dang video) lay tu cac kenh da tick -> dang xuat / xoa.
//   xvfb-run -a node tests/e2e-accounts.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')

const waitFor = async (fn, what, ms = 30000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}

;(async () => {
  const yt = await startMockYt()
  // du lieu cua ban 0.3: phien Studio 'persist:youtube' + token API cua mot kenh
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-tk-e2e-'))
  fs.mkdirSync(path.join(dataDir, 'Partitions', 'youtube'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ loginMode: 'firefox', youtubeChannel: { id: 'UCcu00000000000000000000', title: 'Kênh cũ' } }))
  const b64 = (s) => Buffer.from(s).toString('base64')
  fs.writeFileSync(path.join(dataDir, 'secrets.json'), JSON.stringify({ youtubeToken: { enc: false, v: b64(JSON.stringify({ refresh_token: 'ref-1', access_token: 'acc-1', expires_at: Date.now() + 3600e3 })) } }))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '4000',
  }
  run(9401, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const acc = async (id) => (await call('hello')).f.accounts.list.find((a) => a.id === id)
    const pages = () => browser.contexts().flatMap((c) => c.pages())

    // 1) di tru: phien cu thanh "Tai khoan 1" (giu ten phien), bo loginMode; token / kenh API cu bi bo,
    // kenh dang video cu thanh kenh dang video mac dinh
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()
    await ui.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor()
    let st = await call('hello')
    assert.deepEqual(st.f.accounts.list.map((a) => [a.id, a.partition]), [['tk-1', 'persist:youtube']])
    assert(!('apiChannels' in st.settings) && !('youtubeChannel' in st.settings), Object.keys(st.settings).join())
    assert.equal(st.settings.uploadChannel, 'UCcu00000000000000000000')
    const secrets = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'))
    assert.deepEqual(Object.keys(secrets), [], 'bo token API cu')
    assert(st.logs.some((l) => /Đã bỏ dữ liệu YouTube Data API cũ/.test(l.msg)), st.logs.map((l) => l.msg).join('\n'))
    assert(st.logs.some((l) => /Phiên YouTube Studio cũ đã thành "Tài khoản 1"/.test(l.msg)))
    await waitFor(async () => (await acc('tk-1')).status === 'needs-sign-in', 'kiem cookie luc mo app')

    // 2) them tai khoan -> dang nhap trong khung Studio ben phai
    await ui.getByRole('button', { name: 'Thêm tài khoản' }).click()
    await ui.getByLabel('Tên gợi nhớ').fill('Nick Thắng')
    await ui.getByRole('button', { name: 'Thêm và đăng nhập' }).click()
    await ui.getByRole('button', { name: 'Xong, đóng lại' }).waitFor()
    let pane
    await waitFor(() => (pane = pages().find((p) => p.url().includes('/studio/signin'))), 'khung Studio mo trang dang nhap')
    const box = await ui.locator('[data-pane]').boundingBox()
    await waitFor(async () => Math.abs((await pane.evaluate(() => innerWidth)) - box.width) <= 2, 'khung dung vi tri')
    // user agent THAT (co "Electron/"), xin trang vi-VN: khong gia trinh duyet khac
    const hit = yt.events.find((e) => e.type === 'studio')
    assert(/Electron\//.test(hit.ua), `UA phai giu chu Electron/: ${hit.ua}`)
    assert(!/Firefox/.test(hit.ua), hit.ua)
    assert(/^vi-VN/.test(hit.lang), hit.lang)
    assert.equal(await pane.evaluate(() => navigator.userAgent), hit.ua)
    await pane.fill('#identifierId', 'athang@versee.net')
    await pane.click('#next')
    await ui.getByText('YouTube Studio · UCDarkFaith9999000000000').waitFor()
    await ui.getByRole('button', { name: 'Xong, đóng lại' }).click()
    await ui.getByRole('button', { name: 'Xong, đóng lại' }).waitFor({ state: 'detached' })

    // 3) kiem tra chay nen: da dang nhap, doc 7 kenh (bo "Khong co kenh" va "Cac tai khoan khac")
    await waitFor(async () => { const a = await acc('nick-thang'); return a.status === 'signed-in' && a.channels.length }, 'doc kenh', 40000)
    let a = await acc('nick-thang')
    assert.equal(a.partition, 'persist:yt-nick-thang')
    assert.equal(a.email, 'athang@versee.net')
    assert.equal(a.channels.length, 7)
    assert.equal(a.channels.find((c) => c.active).name, 'Dark Faith 2nd')
    assert.equal(a.channels.find((c) => c.name === 'Dark Faith 2nd').ucId, 'UCDarkFaith9999000000000')
    await ui.getByText('athang@versee.net · 7 kênh, dùng 0').waitFor()
    // anh dai dien kenh doc tu "Chuyen doi tai khoan", hien canh ten kenh; kenh khong co anh -> chu cai
    assert.equal(a.channels.find((c) => c.name === 'Dark Faith 2nd').avatar, `${yt.base}/yt3/UCDarkFaith9999000000000=s48-c-k-c0x00ffffff-no-rj`)
    assert.equal(a.channels.find((c) => c.name === '28k s').avatar, '')
    await waitFor(() => ui.evaluate(() => [...document.querySelectorAll('img[referrerpolicy="no-referrer"]')].filter((i) => i.complete && i.naturalWidth > 0).length >= 6), 'anh dai dien kenh tren trang Tai khoan')
    // trang Trang chu kenh dung lai anh do (khong tai lai): danh sach "Kenh cu can them" co anh that, kenh khong anh -> chu cai
    await ui.getByRole('button', { name: 'Trang chủ kênh', exact: true }).click()
    const homeRow = (name) => ui.locator('li', { has: ui.getByLabel(`Chọn kênh ${name}`) })
    await waitFor(() => homeRow('Dark Faith 2nd').locator('img').evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false), 'anh dai dien o Trang chu kenh')
    assert.equal(await homeRow('28k s').locator('img').count(), 0)
    await waitFor(async () => ((await call('hello')).f.hometab.channels.find((c) => c.name === 'Dark Faith 2nd') || {}).avatar === `${yt.base}/yt3/UCDarkFaith9999000000000=s48-c-k-c0x00ffffff-no-rj`, 'hometab giu avatar')
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()

    // 4) tick kenh
    await ui.getByLabel('Dùng kênh Dark Bible Stories').click()
    await ui.getByLabel('Dùng kênh Simple Bible Animation').click()
    await waitFor(async () => (await acc('nick-thang')).channels.filter((c) => c.enabled).length === 2, 'tick kenh')

    // 5) ctx.withChannel qua lenh thu: cua so an, chuyen kenh, hoc UC; hai viec cung tai khoan chay lan luot
    await Promise.all([call('accounts_try', 'nick-thang:Dark Bible Stories'), call('accounts_try', 'nick-thang:Simple Bible Animation')])
    st = await call('hello')
    const L = st.logs.map((l) => l.msg)
    assert(L.includes('Thử kênh: Studio đang ở "Dark Bible Stories" (UCmock000000000000000000).'), L.slice(-8).join('\n'))
    assert(L.includes('Thử kênh: Studio đang ở "Simple Bible Animation" (UCBibleSimpleAnimation68).'), L.slice(-8).join('\n'))
    assert.deepEqual(yt.events.filter((e) => e.type === 'switch').map((e) => e.name), ['Dark Bible Stories', 'Simple Bible Animation'])
    a = await acc('nick-thang')
    assert.deepEqual(st.f.accounts.list.find((x) => x.id === 'nick-thang').channels.filter((c) => c.enabled).map((c) => c.key), ['UCmock000000000000000000', 'UCBibleSimpleAnimation68'])
    // khoa cu (truoc khi biet UC) van dung duoc; cua so an dung lai, ranh thi tu dong
    await call('accounts_try', 'nick-thang:Dark Bible Stories')
    assert.equal((await call('hello')).f.accounts.debug.ucId, 'UCmock000000000000000000')
    assert.equal(pages().filter((p) => /\/studio\/channel\//.test(p.url())).length, 2, 'khung Studio + 1 cua so an')
    await waitFor(() => pages().filter((p) => /\/studio\/channel\//.test(p.url())).length === 1, 'dong cua so an khi ranh', 15000)

    // 6) khung Studio theo kenh chon o tren dau khung
    await ui.getByLabel('Tài khoản / kênh trong khung Studio').selectOption('c:UCmock000000000000000000')
    await ui.getByText('YouTube Studio · Dark Bible Stories').waitFor({ timeout: 30000 })
    assert.equal((await call('hello')).f.accounts.pane.channelKey, 'UCmock000000000000000000')

    // 6b) Toi uu video: chon so video quet (luu cai dat), quet; bam tieu de video -> trang Tai khoan,
    // khung Studio chuyen sang dung kenh cua video roi mo trang chinh sua video
    await ui.getByLabel('Tài khoản / kênh trong khung Studio').selectOption('c:UCBibleSimpleAnimation68')
    await ui.getByText('YouTube Studio · Simple Bible Animation').waitFor({ timeout: 30000 })
    await ui.getByRole('button', { name: 'Tối ưu video', exact: true }).click()
    await ui.getByRole('heading', { name: 'Tối ưu video' }).waitFor()
    await ui.getByLabel('Kênh cần tối ưu').selectOption('UCmock000000000000000000')
    assert.equal(await ui.getByLabel('Số video cần quét').inputValue(), '10', 'mac dinh 10 video')
    await ui.getByLabel('Số video cần quét').selectOption('5')
    await waitFor(async () => (await call('hello')).f.optimize.limit === 5, 'chon 5 video')
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).optimizeScanLimit, 5, 'luu so video vao cai dat')
    await ui.getByRole('button', { name: 'Quét video' }).click()
    await waitFor(async () => { const o = (await call('hello')).f.optimize; return !o.busy && o.videos.length === 5 }, 'quet 5 video', 90000)
    const titles = ui.getByRole('button', { name: /^Mở trang chỉnh sửa video / })
    assert.equal(await titles.count(), 5)
    assert.match(await titles.first().getAttribute('title'), /^Mở trang chỉnh sửa video trong Tài khoản trình duyệt/)
    assert.equal(await titles.first().evaluate((el) => getComputedStyle(el).cursor), 'pointer')
    const switches = yt.events.filter((e) => e.type === 'switch').length
    await titles.first().click()
    await ui.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor()
    await waitFor(() => pages().some((p) => p.url().includes('/studio/video/Prem0000001/edit')), 'khung Studio mo trang chinh sua video', 30000)
    st = await call('hello')
    assert.deepEqual(st.f.accounts.pane, { accountId: 'nick-thang', channelKey: 'UCmock000000000000000000' })
    assert.deepEqual(yt.events.filter((e) => e.type === 'switch').slice(switches).map((e) => e.name), ['Dark Bible Stories'], 'chuyen kenh trong khung truoc khi mo video')
    assert(st.logs.some((l) => /Khung Studio: mở .*\/studio\/video\/Prem0000001\/edit \(kênh "Dark Bible Stories"\)/.test(l.msg)), st.logs.slice(-6).map((l) => l.msg).join('\n'))

    // 7) kenh dang video = cac kenh da tick; kenh cu (UCcu...) khong con -> kenh dau tien; chon kenh khac -> luu
    await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
    const pick = ui.getByLabel('Kênh đăng video')
    await pick.waitFor()
    assert.deepEqual(await pick.locator('option').allTextContents(), ['Dark Bible Stories (@BibleStoriies)', 'Simple Bible Animation (@BibleSimpleAnimation68)'])
    assert.equal((await call('hello')).upload.channelKey, 'UCmock000000000000000000')
    await pick.selectOption('UCBibleSimpleAnimation68')
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).uploadChannel === 'UCBibleSimpleAnimation68', 'luu kenh dang video')
    assert.equal((await call('hello')).upload.channelKey, 'UCBibleSimpleAnimation68')

    // 8) doi ten, dang xuat (giu kenh), xoa
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()
    await ui.getByRole('button', { name: 'Đổi tên Nick Thắng' }).click()
    await ui.getByLabel('Tên gợi nhớ').fill('Thắng chính')
    await ui.getByRole('button', { name: 'Lưu', exact: true }).click()
    await ui.getByRole('heading', { name: 'Thắng chính' }).waitFor()
    await ui.getByRole('button', { name: 'Đăng xuất Thắng chính' }).click()
    await ui.getByRole('dialog').getByRole('button', { name: 'Đăng xuất' }).click()
    await waitFor(async () => (await acc('nick-thang')).status === 'needs-sign-in', 'dang xuat')
    a = await acc('nick-thang')
    assert.equal(a.channels.length, 7)
    await call('accounts_try', 'UCmock000000000000000000')
    assert.match((await call('hello')).f.accounts.debug.error, /chưa đăng nhập/)
    await ui.getByRole('button', { name: 'Xóa Tài khoản 1' }).click()
    await ui.getByRole('dialog').getByRole('button', { name: 'Xóa' }).click()
    await waitFor(async () => (await call('hello')).f.accounts.list.length === 1, 'xoa tai khoan')
    // giao dien ve lai sau trang thai: cho nut bi khoa thay vi doc ngay
    await waitFor(() => ui.getByRole('button', { name: 'Xóa Thắng chính' }).isDisabled(), 'giu it nhat mot tai khoan', 10000)
    const saved = fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')
    assert(!/password|loginMode/i.test(saved), 'khong luu mat khau / kieu dang nhap cu')
    if (process.env.YA_SHOT) {
      await call('accounts_check', 'nick-thang')
      await sleep(1500)
      require('child_process').execFileSync('import', ['-window', 'root', path.join(process.env.YA_SHOT, 'app-tai-khoan.png')])
    }
    console.log('E2E ACCOUNTS PASSED')
  }, dataDir)
})()
