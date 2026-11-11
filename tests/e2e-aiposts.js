// Chay that app voi YouTube gia (tests/mock-yt) + Gemini gia: trang "Đăng bài AI".
// Dang nhap tai khoan -> tick kenh -> chon kenh + yeu cau cho Gemini, loai bai, so bai, ngay gio ->
// "Viết bài" (Gemini viet + ve anh) -> sua mot bai -> "Đăng N bài" (len lich tren tab Bai dang) ->
// lan sau Gemini nhan duoc bai cu (khong lap lai); tat "Duyệt trước khi đăng": mot nut viet va dang luon.
//   xvfb-run -a node tests/e2e-aiposts.js        Gemini API (key, may chu Gemini gia)
//   xvfb-run -a node tests/e2e-aiposts.js web    Gemini tren trinh duyet: ctx.geminiWeb gia (tests/gemini-web-fake.js)
//     + loi chua dang nhap -> nut "Mở Gemini", du phong API, bam Dung luc Gemini dang viet.
//   Khi ghep src/gemini-web.js that: co the thay YA_GEMINI_WEB_FAKE bang trang Gemini gia (YA_GEMINI_BASE) cua nhanh gemini-web.
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
const WEB = process.argv[2] === 'web'

;(async () => {
  const yt = await startMockYt()
  const gm = await startMock()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-aiposts-e2e-'))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_GOOGLE_MOCK: gm.url, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000',
    ...(WEB ? { YA_GEMINI_WEB_FAKE: gm.url } : {}),
  }
  const images = () => (WEB ? (gm.webImages || []).length : gm.images || 0)
  run(WEB ? 9452 : 9451, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const st = () => call('hello')
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    const posts = () => yt.server.postsDb || []

    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    // mac dinh: Gemini tren trinh duyet (khong can key); che do API: chon "API key" -> can key
    assert.equal((await st()).settings.aiProvider, 'web')
    if (!WEB) await call('settings_save', { aiProvider: 'api' })
    await ui.getByRole('button', { name: 'Đăng bài AI', exact: true }).click()
    await ui.getByRole('heading', { name: 'Đăng bài tự động' }).waitFor()
    if (WEB) {
      await ui.getByText(/Viết bằng:\s*Gemini trên trình duyệt/).waitFor()
      assert.equal(await ui.getByText(/cần Gemini API key/).count(), 0, 'trinh duyet khong can key')
    } else {
      await ui.getByText(/Viết bằng:\s*Gemini API \(gemini-3\.8-flash\)/).waitFor()
      await ui.getByText(/Đang chọn Gemini API: cần Gemini API key để viết bài/).waitFor()
    }
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
    if (!WEB) await call('gemini_set', 'gemini-ok')
    else {
      // Cai dat -> Gemini: chon tai khoan Google dung cho Gemini (mac dinh tai khoan dau tien)
      await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
      const acc = ui.getByLabel('Tài khoản Google dùng cho Gemini')
      assert.equal(await acc.inputValue(), '')
      await acc.selectOption('nick-thang')
      await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
      await waitFor(async () => (await st()).settings.geminiAccount === 'nick-thang', 'luu tai khoan Gemini')
    }
    await ui.getByRole('button', { name: 'Đăng bài AI', exact: true }).click()
    await ui.getByRole('heading', { name: 'Đăng bài tự động' }).waitFor()
    if (WEB) await ui.getByText('Viết bằng: Gemini trên trình duyệt (tài khoản Nick Thắng)').waitFor()

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
    assert.equal(images(), 1, 'Gemini ve 1 anh')
    assert(fs.existsSync(s.drafts[1].images[0]), 'anh da luu')
    assert.equal(fs.readFileSync(s.drafts[1].images[0]).subarray(1, 4).toString(), 'PNG')
    if (WEB) {
      // Gemini tren trinh duyet: khong goi API; loi nhac doi mot khoi JSON; cau tra loi co chu thua van doc duoc
      assert(!gm.calls.some((c) => /generateContent/.test(c.path)), 'khong goi Gemini API')
      assert.match(gm.webPrompts[0], /ONE valid JSON object[\s\S]*Chỉ trả lời bằng một khối JSON hợp lệ/)
      assert.match(gm.webImages[0], /Create an image[\s\S]*Aspect ratio 1:1[\s\S]*garden of Eden/)
      assert.equal((await st()).geminiWeb.signedIn, true)
      assert.equal((await st()).geminiWeb.accountId, 'nick-thang')
    } else assert.equal((gm.webPrompts || []).length, 0, 'API: khong dung trinh duyet')
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

    if (WEB) {
      // bat lai duyet de chi viet (khong dang)
      await ui.getByRole('switch', { name: 'Duyệt trước khi đăng' }).click()
      await waitFor(async () => (await st()).f.aiposts.opts.review === true, 'bat duyet')
      const write = ui.getByRole('button', { name: 'Viết bài (1 kênh × 1)' })
      // 1) chua dang nhap Gemini: bao loi + huong dan + nut "Mở Gemini" (mo cua so Gemini); khong goi API
      gm.opts.webFail = 'GEMINI_SIGNIN'
      const nApi = gm.calls.filter((c) => /generateContent/.test(c.path)).length
      await write.click()
      const alert = ui.getByRole('alert').filter({ hasText: 'Chưa đăng nhập Google trong tài khoản dùng cho Gemini.' })
      await alert.waitFor({ timeout: 30000 })
      await alert.getByText(/Bấm “Mở Gemini”, đăng nhập trong cửa sổ Gemini/).waitFor()
      assert.equal((await st()).f.aiposts.aiError.code, 'GEMINI_SIGNIN')
      assert.equal((await st()).geminiWeb.signedIn, false)
      await ui.getByText('Chưa đăng nhập Gemini').first().waitFor()
      await alert.getByRole('button', { name: 'Mở Gemini' }).click()
      await waitFor(() => gm.webOpened === 1, 'nut Mo Gemini')
      assert.equal(gm.calls.filter((c) => /generateContent/.test(c.path)).length, nApi, 'du phong tat: khong goi API')
      assert.equal((await st()).f.aiposts.drafts.length, 0)
      // 2) bat "Dùng API khi trình duyệt lỗi" + co key -> API viet thay, ghi nhat ky
      await call('gemini_set', 'gemini-ok')
      await call('settings_save', { aiFallbackApi: true })
      await write.click()
      await waitFor(async () => { const a = (await st()).f.aiposts; return !a.busy && a.drafts.length === 1 }, 'du phong API viet bai', 60000)
      assert(gm.calls.filter((c) => /generateContent/.test(c.path)).length > nApi, 'da goi API du phong')
      assert((await st()).logs.some((l) => l.level === 'warn' && /Gemini trên trình duyệt chưa viết được[\s\S]*thử lại bằng Gemini API/.test(l.msg)))
      assert.equal(await ui.getByRole('alert').count(), 0, 'het loi thi an huong dan')
      // 3) bam Dung luc Gemini (trinh duyet) dang viet: dung ngay, khong goi API du phong
      gm.opts.webFail = null
      gm.opts.webDelay = 20000
      const nApi2 = gm.calls.filter((c) => /generateContent/.test(c.path)).length
      const nWeb = gm.webPrompts.length
      await write.click()
      await waitFor(() => gm.webPrompts.length > nWeb, 'gui loi nhac cho Gemini', 10000)
      await ui.getByRole('button', { name: 'Dừng' }).click()
      const t0 = Date.now()
      await waitFor(async () => !(await st()).f.aiposts.busy, 'dung viet bai', 10000)
      assert(Date.now() - t0 < 5000, `dung cham ${Date.now() - t0} ms`)
      assert.equal((await st()).f.aiposts.drafts.length, 1, 'khong them bai')
      assert.equal(gm.calls.filter((c) => /generateContent/.test(c.path)).length, nApi2, 'Dung: khong du phong API')
      assert((await st()).logs.some((l) => /đã dừng theo yêu cầu/.test(l.msg)), 'nhat ky dung')
    }
    console.log(`E2E AIPOSTS (${WEB ? 'GEMINI TRINH DUYET' : 'GEMINI API'}) PASSED`)
  }, dataDir)
})()
