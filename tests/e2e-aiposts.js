// Chay that app voi YouTube gia (tests/mock-yt) + Gemini gia: trang "Đăng bài AI".
// Dang nhap tai khoan -> tick kenh -> chon kenh + yeu cau cho Gemini, loai bai, so bai, ngay gio ->
// "Viết bài" (Gemini viet + ve anh) -> sua mot bai -> "Đăng N bài" (len lich tren tab Bai dang) ->
// lan sau Gemini nhan duoc bai cu (khong lap lai); tat "Duyệt trước khi đăng": mot nut viet va dang luon.
//   xvfb-run -a node tests/e2e-aiposts.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')
const { startMock } = require('./google-mock')

const waitFor = async (fn, what, ms = 60000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}
const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

;(async () => {
  const yt = await startMockYt()
  const gm = await startMock()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-aiposts-e2e-'))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_GOOGLE_MOCK: gm.url, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000',
  }
  run(9451, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const st = () => call('hello')
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    const posts = () => yt.server.postsDb || []

    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    await ui.getByRole('button', { name: 'Đăng bài AI', exact: true }).click()
    await ui.getByRole('heading', { name: 'Đăng bài tự động' }).waitFor()
    await ui.getByText('Cần Gemini API key để viết bài.').waitFor()
    await ui.getByRole('button', { name: 'Thêm và tick kênh ở trang Tài khoản' }).waitFor()

    // dang nhap tai khoan gia o trang Tai khoan (co khung Studio), tick "Dark Faith 2nd"
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()
    await ui.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor()
    await call('accounts_add', { label: 'Nick Thắng', login: true })
    let pane
    await waitFor(() => (pane = pages().find((p) => p.url().includes('/studio/signin'))), 'trang dang nhap')
    await pane.fill('#identifierId', 'athang@versee.net')
    await pane.click('#next')
    await waitFor(async () => /UCDarkFaith9999/.test((await st()).studio.channelId), 'vao Studio')
    await call('accounts_login_done')
    await waitFor(async () => ((await st()).f.accounts.list.find((a) => a.id === 'nick-thang') || { channels: [] }).channels.length === 7, 'doc kenh')
    await call('accounts_enable', { key: 'nick-thang:Dark Faith 2nd', enabled: true })
    await call('gemini_set', 'gemini-ok')
    await ui.getByRole('button', { name: 'Đăng bài AI', exact: true }).click()
    await ui.getByRole('heading', { name: 'Đăng bài tự động' }).waitFor()

    // chon kenh + yeu cau, loai bai (chu, anh, tham do, cau do), 4 bai, ngay mai -> ngay kia, 09:00 + 20:00
    const chip = ui.getByRole('group', { name: 'Kênh đăng bài tự động' }).getByRole('button', { name: 'Dark Faith 2nd' })
    await chip.click()
    await waitFor(async () => (await chip.getAttribute('aria-pressed')) === 'true', 'chon kenh')
    const req = ui.getByLabel('Yêu cầu cho Gemini: Dark Faith 2nd')
    await req.fill('Faith encouragement for Black Christian women, warm tone, scripture-based.')
    await req.blur()
    await waitFor(async () => Object.values((await st()).f.aiposts.opts.perChannel).some((c) => /warm tone/.test(c.request || '')), 'luu yeu cau kenh')
    const KEY = (await st()).f.aiposts.opts.channels[0]
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const after = new Date(); after.setDate(after.getDate() + 2)
    await ui.getByLabel('Từ ngày').fill(ymd(tomorrow))
    await ui.getByLabel('Đến ngày').fill(ymd(after))
    const count = ui.getByLabel('Số bài mỗi kênh')
    await count.fill('4')
    await count.blur()
    await waitFor(async () => (await st()).f.aiposts.opts.count === 4, 'luu so bai')
    const o = (await st()).f.aiposts.opts
    assert.deepEqual([o.from, o.to, o.times, o.types], [ymd(tomorrow), ymd(after), '09:00, 20:00', ['text', 'image', 'poll', 'quiz']])

    // Viet bai: Gemini viet 4 bai (dung loai, dung gio), ve 1 anh cho bai anh
    await ui.getByRole('button', { name: 'Viết bài (1 kênh × 4)' }).click()
    await waitFor(async () => { const s = (await st()).f.aiposts; return !s.busy && s.drafts.length === 4 }, 'gemini viet xong', 60000)
    let s = (await st()).f.aiposts
    assert.deepEqual(s.drafts.map((d) => d.type), ['text', 'image', 'poll', 'quiz'])
    assert.deepEqual(s.drafts.map((d) => { const w = new Date(d.when); return `${w.getDate()} ${w.getHours()}` }), [`${tomorrow.getDate()} 9`, `${tomorrow.getDate()} 20`, `${after.getDate()} 9`, `${after.getDate()} 20`])
    assert.equal(gm.images, 1, 'Gemini ve 1 anh')
    assert(fs.existsSync(s.drafts[1].images[0]), 'anh da luu')
    assert.match(gm.postPrompts[0], /warm tone, scripture-based/)
    assert.match(gm.postPrompts[0], /Dark Faith 2nd/)
    assert.match(gm.postPrompts[0], /in this order of types: text, image, poll, quiz\./)
    await ui.getByLabel('Lựa chọn 3').waitFor()
    // sua chu bai dau truoc khi dang
    const box = ui.getByLabel('Nội dung bài').first()
    await box.fill('Edited: God is close to the brokenhearted. #faith')
    await box.blur()
    await waitFor(async () => (await st()).f.aiposts.drafts[0].text.startsWith('Edited:'), 'luu chu da sua')

    // Dang 4 bai: len lich tren tab Bai dang cua kenh
    await ui.getByRole('button', { name: 'Đăng 4 bài', exact: true }).click()
    await waitFor(async () => { const a = (await st()).f.aiposts; return !a.busy && a.drafts.every((d) => d.status !== 'queued' && d.status !== 'run') }, 'dang xong', 240000)
    s = (await st()).f.aiposts
    assert(s.drafts.every((d) => d.status === 'done'), JSON.stringify(s.drafts.map((d) => [d.type, d.status, d.error])))
    assert.equal(posts().length, 4, JSON.stringify(posts()))
    assert.equal(posts()[0].text, 'Edited: God is close to the brokenhearted. #faith')
    assert(posts().every((p) => p.scheduledAt), 'moi bai deu len lich')
    assert.deepEqual(posts().map((p) => p.type), ['text', 'image', 'poll', 'quiz'])
    assert.deepEqual(posts()[2].options, s.drafts[2].options.map((x) => x.text))
    assert.equal(posts()[3].answers.filter((x) => x.correct).length, 1)
    assert.equal(posts()[1].images.length, 1, 'bai anh co anh')
    const w0 = new Date(s.drafts[0].when)
    assert.equal(posts()[0].scheduledAt, `${ymd(w0)}T${p2(w0.getHours())}:${p2(w0.getMinutes())}`)
    const hist = JSON.parse(fs.readFileSync(path.join(dataDir, 'ai-posts-history.json'), 'utf8'))
    assert.equal(hist[KEY].posts.length, 4, 'nho bai da dang')

    // Tat duyet: mot nut viet va dang luon; Gemini nhan bai cu de khong lap lai
    await ui.getByRole('button', { name: /3\. Tuỳ chọn/ }).click()
    await ui.getByRole('switch', { name: 'Duyệt trước khi đăng' }).click()
    await waitFor(async () => (await st()).f.aiposts.opts.review === false, 'tat duyet')
    await count.fill('1')
    await count.blur()
    await waitFor(async () => (await st()).f.aiposts.opts.count === 1, 'luu so bai = 1')
    await ui.getByRole('button', { name: 'Viết và đăng luôn (1 kênh × 1)' }).click()
    await waitFor(() => posts().length === 5, 'viet va dang luon', 240000)
    await waitFor(async () => !(await st()).f.aiposts.busy, 'het ban')
    assert.match(gm.postPrompts[1], /Recent posts already published[\s\S]*Edited: God is close/)
    s = (await st()).f.aiposts
    assert.equal(s.drafts.filter((d) => d.status === 'done').length, 5)
    await ui.getByRole('button', { name: 'Ẩn bài đã đăng' }).click()
    await waitFor(async () => (await st()).f.aiposts.drafts.length === 0, 'an bai da dang')
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'ai-posts.json'), 'utf8')).length, 0, 'luu danh sach ban nhap')
    console.log('E2E AIPOSTS PASSED')
  }, dataDir)
})()
