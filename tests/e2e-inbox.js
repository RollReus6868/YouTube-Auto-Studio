// Chay that app voi Studio gia (tests/mock-yt) + Gemini gia: dang nhap tai khoan -> tick kenh ->
// trang Cong dong: chon kenh, "Lay binh luan moi" (cua so an, chuyen kenh, hop thu Studio) ->
// Gemini soan -> tu gui loi khen (theo gioi han moi gio) -> sua va gui cau hoi -> lay lai khong gui trung.
//   xvfb-run -a node tests/e2e-inbox.js
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

;(async () => {
  const yt = await startMockYt()
  const gm = await startMock()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-inbox-e2e-'))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_GOOGLE_MOCK: gm.url, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000', YA_INBOX_GAP_MS: '0',
  }
  run(9441, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const st = () => call('hello')
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    const replies = () => yt.events.filter((e) => e.type === 'reply')

    // trang Cong dong khi chua co kenh nao: chi duong sang trang Tai khoan
    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    await ui.getByRole('button', { name: 'Cộng đồng', exact: true }).click()
    await ui.getByRole('heading', { name: 'Cộng đồng', exact: true }).waitFor()
    await ui.getByRole('button', { name: 'Thêm và tick kênh ở trang Tài khoản' }).waitFor()
    assert.equal(await ui.locator('[data-pane]').count(), 1, 'trang Cong dong co khung Studio')

    // dang nhap tai khoan gia, doc kenh, tick "Dark Faith 2nd"
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
    await call('settings_save', { replyMode: 'auto', replyPerHour: 1 })

    // chon kenh tren trang Cong dong -> lay binh luan
    const chip = ui.getByRole('group', { name: 'Kênh lấy bình luận' }).getByRole('button', { name: 'Dark Faith 2nd' })
    await chip.click()
    await waitFor(async () => (await chip.getAttribute('aria-pressed')) === 'true', 'tick kenh tren trang')
    await ui.getByRole('button', { name: 'Lấy bình luận mới' }).click()
    await ui.getByRole('button', { name: /Dừng/ }).waitFor()
    await waitFor(async () => !(await st()).f.inbox.busy, 'lay xong', 120000)
    let s = await st()
    const items = s.f.inbox.items
    const byAuthor = (a) => items.find((x) => x.author === a)
    assert.equal(items.length, 9, `9 binh luan chua phan hoi (bo hang kenh da tra loi): ${items.map((x) => x.author)}`)
    assert(items.every((x) => x.source === 'studio' && x.channelName === 'Dark Faith 2nd'))
    assert.equal(byAuthor('@ElizabethBade-l7n').id, 'UgxEliz01', 'ma = comment-id cua Studio')
    assert.equal(byAuthor('@ruthann-k2').status, 'ready')
    assert.equal(byAuthor('@ruthann-k2').draft, 'Tuần sau nhé bạn!')
    // Gemini gia: co dau "?" (ca trong tieu de video) = cau hoi, con lai = khen -> 2 loi khen (Elizabeth, Millie).
    // Gioi han 1/gio: chi tu gui 1, dung kenh, co emoji
    assert.deepEqual(items.filter((x) => x.kind === 'khen').map((x) => x.author).sort(), ['@ElizabethBade-l7n', '@milliecook8852'])
    assert.equal(replies().length, 1, JSON.stringify(replies()))
    assert.deepEqual(replies().map((r) => [r.id, r.text]), [['UgxEliz01', 'Cảm ơn bạn nhiều ❤️']])
    assert.equal(s.f.inbox.sentLastHour, 1)
    assert.equal(s.comments.items.filter((x) => x.source === 'studio').length, 0, 'trang Binh luan (API) khong hien binh luan Studio')
    assert(s.logs.some((l) => l.msg === 'Cộng đồng: đã tự gửi 1 trả lời cho bình luận khen.'), s.logs.slice(-10).map((l) => l.msg).join('\n'))

    // sua roi gui cau hoi: dang het gioi han -> bao, tang gioi han -> gui
    const box = ui.getByLabel('Trả lời @ruthann-k2')
    await box.fill('Notes are in the description 🙏 God bless!')
    await ui.locator('article', { has: box }).getByRole('button', { name: 'Gửi', exact: true }).click()
    await waitFor(async () => (await st()).logs.some((l) => /Đã gửi đủ 1 trả lời trong 1 giờ qua/.test(l.msg)), 'bao het gioi han')
    assert.equal(replies().length, 1)
    await call('settings_save', { replyPerHour: 20 })
    await ui.locator('article', { has: box }).getByRole('button', { name: 'Gửi', exact: true }).click()
    await waitFor(() => replies().some((r) => r.author === '@ruthann-k2'), 'gui tra loi da sua', 60000)
    assert.equal(replies().find((r) => r.author === '@ruthann-k2').text, 'Notes are in the description 🙏 God bless!')
    await waitFor(async () => (await st()).f.inbox.items.find((x) => x.author === '@ruthann-k2').status === 'sent', 'danh dau da gui')

    // lay lai: binh luan da tra loi khong gui lai; loi khen con lai (Shorts, hang bien mat sau khi gui) duoc tu gui
    await ui.getByRole('button', { name: 'Lấy bình luận mới' }).click()
    await sleep(500)
    await waitFor(async () => !(await st()).f.inbox.busy, 'lay lai xong', 180000)
    s = await st()
    const keys = replies().map((r) => r.key)
    assert.equal(new Set(keys).size, keys.length, `tra loi trung: ${keys}`)
    assert.deepEqual(replies().map((r) => r.author), ['@ElizabethBade-l7n', '@ruthann-k2', '@milliecook8852'])
    assert.equal(s.f.inbox.items.length, 9, 'khong them binh luan trung')
    assert.deepEqual(s.f.inbox.items.filter((x) => x.status === 'sent').map((x) => x.author).sort(), ['@ElizabethBade-l7n', '@milliecook8852', '@ruthann-k2'])
    assert(s.f.inbox.items.every((x) => x.status === 'sent' || x.status === 'ready'), JSON.stringify(s.f.inbox.items.map((x) => [x.author, x.status, x.error])))
    await ui.getByRole('button', { name: 'Chờ duyệt (6)' }).waitFor()

    // Dung: dung ngay luot dang chay, khong tu lay binh luan nua (nut "Bat lai tu dong"); lay tay = bat lai
    await ui.getByRole('button', { name: 'Lấy bình luận mới' }).click()
    await ui.getByRole('button', { name: /Dừng/ }).click()
    await waitFor(async () => !(await st()).f.inbox.busy, 'dung xong', 30000)
    s = await st()
    assert.equal(s.f.inbox.paused, true)
    assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).inboxPaused, true, 'nho trang thai dung')
    assert(s.logs.some((l) => /đã bấm Dừng/.test(l.msg)))
    await ui.getByRole('button', { name: 'Bật lại tự động' }).click()
    await waitFor(async () => (await st()).f.inbox.paused === false, 'bat lai tu dong')

    // Gui het: 6 ban nhap (dung chu da sua tren the), moi kenh mo hop thu mot lan, khong gui trung
    const first = s.f.inbox.items.find((x) => x.status === 'ready')
    await ui.getByLabel(`Trả lời ${first.author}`).fill('Đã sửa trước khi gửi hết 🙏')
    const opens0 = yt.hits.filter((h) => /\/comments\/inbox/.test(h)).length
    await ui.getByRole('button', { name: 'Gửi hết (6)' }).click()
    await waitFor(() => replies().length === 9, 'gui het 6 tra loi', 120000)
    await waitFor(async () => (await st()).f.inbox.sending === 0, 'gui xong')
    s = await st()
    assert(s.f.inbox.items.every((x) => x.status === 'sent'), JSON.stringify(s.f.inbox.items.map((x) => [x.author, x.status, x.error])))
    assert.equal(replies().find((r) => r.author === first.author).text, 'Đã sửa trước khi gửi hết 🙏')
    assert.equal(new Set(replies().map((r) => r.key)).size, 9, 'khong tra loi trung')
    assert.equal(yt.hits.filter((h) => /\/comments\/inbox/.test(h)).length - opens0, 1, 'mo hop thu 1 lan cho ca 6 tra loi')
    // bo tick kenh: khong hien binh luan, khong doc hop thu, khong gui cua kenh do
    await chip.click()
    await waitFor(async () => (await st()).f.inbox.items.length === 0, 'an binh luan cua kenh bo tick')
    const hits0 = yt.hits.length
    await call('inbox_fetch')
    await waitFor(async () => (await st()).logs.some((l) => /Chọn ít nhất một kênh/.test(l.msg)), 'khong doc kenh bo tick')
    assert(!yt.hits.slice(hits0).some((h) => /\/comments\/inbox/.test(h)), 'khong mo hop thu kenh bo tick')
    await chip.click()
    await waitFor(async () => (await st()).f.inbox.items.length === 9, 'tick lai: hien lai binh luan')
    // Quet va tha tim: moi binh luan cua nguoi xem chua co tim (k8 co san tim), nho de lan sau khong bam lai (bam lai = bo tim)
    const hearts = () => yt.events.filter((e) => e.type === 'heart')
    await ui.getByRole('button', { name: 'Quét và thả tim' }).click()
    await waitFor(async () => (await st()).logs.some((l) => /thả tim xong/.test(l.msg)), 'tha tim xong', 120000)
    await waitFor(async () => !(await st()).f.inbox.busy, 'het ban')
    assert(hearts().length >= 8 && hearts().every((e) => e.on), JSON.stringify(hearts()))
    assert(!hearts().some((e) => e.key === 'k8'), 'binh luan da co tim: khong bam')
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'hearted.json'), 'utf8'))
    assert.equal(Object.values(saved)[0] && Object.keys(Object.values(saved)[0]).length, hearts().length, 'nho binh luan da tha tim')
    const n0 = hearts().length
    await ui.getByRole('button', { name: 'Quét và thả tim' }).click()
    await waitFor(async () => (await st()).logs.filter((l) => /thả tim xong/.test(l.msg)).length === 2, 'tha tim lan 2', 120000)
    assert.equal(hearts().length, n0, 'lan 2 khong bam lai')
    if (process.env.YA_SHOT) require('child_process').execFileSync('import', ['-window', 'root', path.join(process.env.YA_SHOT, 'app-cong-dong.png')])
    console.log('E2E INBOX PASSED')
  }, dataDir)
})()
