// Chay that app voi Studio gia (tests/mock-yt) + Google API gia: phien 0.3 thanh "Tai khoan 1",
// them tai khoan -> dang nhap trong khung -> "Xong, dong lai" -> doc kenh -> tick kenh ->
// ctx.withChannel (cua so an, chuyen kenh, kiem UC) -> khung Studio theo kenh chon ->
// token API theo kenh (dung kenh moi nhan) -> dang xuat / xoa.
//   xvfb-run -a node tests/e2e-accounts.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')
const { startMock } = require('./google-mock')

const waitFor = async (fn, what, ms = 30000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}

;(async () => {
  const yt = await startMockYt()
  const gm = await startMock()
  // du lieu cua ban 0.3: phien Studio 'persist:youtube' + token API cua mot kenh
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-tk-e2e-'))
  fs.mkdirSync(path.join(dataDir, 'Partitions', 'youtube'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ loginMode: 'firefox', youtubeChannel: { id: 'UCcu00000000000000000000', title: 'Kênh cũ' } }))
  const b64 = (s) => Buffer.from(s).toString('base64')
  fs.writeFileSync(path.join(dataDir, 'secrets.json'), JSON.stringify({ youtubeToken: { enc: false, v: b64(JSON.stringify({ refresh_token: 'ref-1', access_token: 'acc-1', expires_at: Date.now() + 3600e3 })) } }))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_GOOGLE_MOCK: gm.url, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '4000',
  }
  run(9401, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const acc = async (id) => (await call('hello')).f.accounts.list.find((a) => a.id === id)
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    const logs = async () => (await call('hello')).logs.map((l) => `${l.level} ${l.msg}`)

    // 1) di tru: phien cu thanh "Tai khoan 1" (giu ten phien), token cu thanh token cua kenh, bo loginMode
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()
    await ui.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor()
    let st = await call('hello')
    assert.deepEqual(st.f.accounts.list.map((a) => [a.id, a.partition]), [['tk-1', 'persist:youtube']])
    assert.deepEqual(st.settings.apiChannels, [{ id: 'UCcu00000000000000000000', title: 'Kênh cũ' }])
    assert.equal(st.youtube.channel.id, 'UCcu00000000000000000000')
    const secrets = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'))
    assert(!secrets.youtubeToken && secrets['ytToken:UCcu00000000000000000000'], Object.keys(secrets).join())
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
    // user agent THAT (co "Electron/"), xin trang en-US: khong gia trinh duyet khac
    const hit = yt.events.find((e) => e.type === 'studio')
    assert(/Electron\//.test(hit.ua), `UA phai giu chu Electron/: ${hit.ua}`)
    assert(!/Firefox/.test(hit.ua), hit.ua)
    assert(/^en-US/.test(hit.lang), hit.lang)
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

    // 7) token API theo kenh: chon nham kenh tren Google -> tu choi, dung kenh -> nhan
    await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
    const oauth = path.join(dataDir, 'client.json')
    fs.writeFileSync(oauth, JSON.stringify({ installed: { client_id: '1234567890ab-x.apps.googleusercontent.com', client_secret: 'x', project_id: 'p' } }))
    await call('oauth_import', oauth)
    await ui.getByLabel('Kênh cần kết nối API').selectOption('UCBibleSimpleAnimation68')
    await ui.getByRole('button', { name: 'Đăng nhập kênh' }).click()
    await waitFor(async () => (await logs()).some((l) => /^error .*không phải kênh "Simple Bible Animation"/.test(l)), 'tu choi kenh nham')
    assert.equal(gm.lastAuth.login_hint, 'athang@versee.net')
    assert(!JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8'))['ytToken:UCmock000000000000000000'], 'khong luu token kenh nham')
    assert.equal((await call('hello')).youtube.channel.id, 'UCcu00000000000000000000')
    await ui.getByLabel('Kênh cần kết nối API').selectOption('UCmock000000000000000000')
    await ui.getByRole('button', { name: 'Đăng nhập kênh' }).click()
    await ui.getByText('Kênh Kênh Giả Lập').waitFor()
    st = await call('hello')
    assert.deepEqual(st.settings.apiChannels.map((c) => c.id), ['UCcu00000000000000000000', 'UCmock000000000000000000'])
    await ui.getByRole('button', { name: 'Dùng để đăng video' }).click()
    await ui.getByText('Kênh Kênh cũ').waitFor()

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
    assert(await ui.getByRole('button', { name: 'Xóa Thắng chính' }).isDisabled(), 'giu it nhat mot tai khoan')
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
