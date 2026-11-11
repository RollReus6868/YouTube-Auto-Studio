// Chay that app voi trang Gemini gia (tests/mock-yt/gemini, YA_GEMINI_BASE): dich vu ctx.geminiWeb trong
// cua so Gemini rieng (khong dung khung Studio), goi qua lenh thu gemini_web_try:
// viet chu (hang doi 2 yeu cau), ve anh (luu vao ai-posts/anh), hop thoai chan -> mo cua so, chua dang nhap,
// nguoi dung dong cua so Gemini -> lan sau tao lai, doi tai khoan Gemini.
//   xvfb-run -a -s "-screen 0 1500x950x24" node tests/e2e-gemini.js
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
  const srv = yt.server
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-gemini-e2e-'))
  const env = { YA_GEMINI_BASE: `${yt.base}/gemini`, YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_NO_UPDATE_CHECK: '1' }
  run(9463, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const st = () => call('hello')
    const geminiPages = () => browser.contexts().flatMap((c) => c.pages()).filter((p) => p.url().includes('/gemini/app'))
    const reset = (flags = {}, queue = []) => { srv.geminiFlags = flags; srv.geminiQueue = queue; srv.geminiPrompts = [] }

    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    let s = await st()
    assert.deepEqual([s.geminiWeb.busy, s.geminiWeb.signedIn, s.geminiWeb.accountId], [false, null, 'tk-1'])
    assert.equal(geminiPages().length, 0, 'chua mo cua so Gemini truoc khi can')

    // 1. viet chu: hai yeu cau cung luc -> chay lan luot (hang doi), moi yeu cau mot chat moi
    const ANSWER = 'Mô tả video đoạn một.\n\nĐoạn hai với #hashtag.\n\n```json\n{"ok": true}\n```'
    reset({}, [{ text: ANSWER }])
    const first = call('gemini_web_try', { prompt: 'Viết mô tả cho video "Bí ẩn tập 7".\nGiọng ấm áp.' })
    await sleep(300)
    const second = call('gemini_web_try', { prompt: 'Câu thứ hai' })
    await waitFor(async () => (await st()).geminiWeb.busy, 'dang chay')
    s = await first
    await second
    s = await st()
    assert.equal(s.geminiWeb.try.ok, true, JSON.stringify(s.geminiWeb.try))
    assert.equal(s.geminiWeb.try.text, 'Echo: Câu thứ hai', 'yeu cau thu hai chay sau yeu cau dau')
    assert.deepEqual(srv.geminiPrompts, ['Viết mô tả cho video "Bí ẩn tập 7".\nGiọng ấm áp.', 'Câu thứ hai'])
    assert.equal(s.geminiWeb.signedIn, true)
    assert.equal(s.geminiWeb.busy, false)
    assert.equal(s.geminiWeb.open, true, 'cua so Gemini hien (showInactive) de duoc ve')
    assert.equal(geminiPages().length, 1, 'mot cua so Gemini dung chung')
    const logs = s.logs.map((l) => l.msg)
    assert(logs.includes('Gemini (trình duyệt): đang viết thử…'), logs.join('\n'))
    assert(logs.some((m) => /^Gemini \(trình duyệt\): thử xong \(17 ký tự\)\.$/.test(m)), logs.join('\n'))
    assert.equal(s.studio.job, '', 'khong chiem khung Studio')

    // cau tra loi dau doc dung (nhieu doan + khoi code) - chay lai rieng
    reset({}, [{ text: ANSWER }])
    s = await call('gemini_web_try', { prompt: 'Lần nữa' })
    assert.equal(s.geminiWeb.try.text, ANSWER)

    // 2. ve anh: luu vao <du lieu>/ai-posts/anh, dung byte, tai kem cookie cua phien tai khoan
    reset({}, [{ image: true }])
    s = await call('gemini_web_try', { prompt: 'Vẽ ngọn hải đăng lúc bình minh', image: true })
    const t = s.geminiWeb.try
    assert.equal(t.ok, true, JSON.stringify(t))
    assert.equal(t.mime, 'image/png')
    assert.equal(path.dirname(t.file), path.join(dataDir, 'ai-posts', 'anh'))
    const n = Math.max(...Object.keys(srv.geminiImages).map(Number))
    assert(fs.readFileSync(t.file).equals(srv.geminiImages[n]), 'dung byte anh')

    // 3. hop thoai chan -> GEMINI_BLOCKED, cua so Gemini duoc mo cho nguoi dung xu ly
    reset({ blockedDialog: true })
    s = await call('gemini_web_try', { prompt: 'Xin chào' })
    assert.equal(s.geminiWeb.try.code, 'GEMINI_BLOCKED', JSON.stringify(s.geminiWeb.try))
    assert.equal(s.geminiWeb.open, true)
    assert(s.logs.some((l) => /Gemini \(trình duyệt\): đã lưu ảnh trang lúc lỗi: .*loi-trang/.test(l.msg)), 'luu anh loi')
    assert(fs.readdirSync(path.join(dataDir, 'loi-trang')).some((f) => /gemini\.html$/.test(f)))

    // 4. chua dang nhap -> GEMINI_SIGNIN, status.signedIn = false
    reset({ signedOut: true })
    s = await call('gemini_web_try', { prompt: 'Xin chào' })
    assert.equal(s.geminiWeb.try.code, 'GEMINI_SIGNIN', JSON.stringify(s.geminiWeb.try))
    assert.equal(s.geminiWeb.signedIn, false)
    assert.match(s.geminiWeb.lastError, /Sign in/)

    // 5. nguoi dung dong cua so Gemini -> lan sau tao lai
    await geminiPages()[0].close()
    await waitFor(async () => (await st()).geminiWeb.open === false, 'cua so Gemini dong')
    reset({}, [{ text: 'Sau khi đóng cửa sổ' }])
    s = await call('gemini_web_try', { prompt: 'Còn đó không?' })
    assert.equal(s.geminiWeb.try.text, 'Sau khi đóng cửa sổ', JSON.stringify(s.geminiWeb.try))
    assert.equal(geminiPages().length, 1)

    // 6. doi tai khoan dung cho Gemini -> cua so moi tren phien cua tai khoan do
    await call('accounts_add', { label: 'Nick Hai' })
    await call('gemini_web_account', 'nick-hai')
    s = await st()
    assert.equal(s.settings.geminiAccount, 'nick-hai')
    assert.equal(s.geminiWeb.accountId, 'nick-hai')
    reset({}, [{ text: 'Tài khoản hai' }])
    s = await call('gemini_web_try', { prompt: 'Tài khoản nào?' })
    assert.equal(s.geminiWeb.try.text, 'Tài khoản hai', JSON.stringify(s.geminiWeb.try))
    assert.equal(s.geminiWeb.accountId, 'nick-hai')
    assert.equal(geminiPages().length, 1, 'cua so cu (tai khoan 1) da dong')
    // phien moi: cookie cua trang Gemini gia nam o partition persist:yt-nick-hai
    const parts = fs.readdirSync(path.join(dataDir, 'Partitions'))
    assert(parts.includes('yt-nick-hai'), parts.join(','))

    // 7. mo cua so Gemini tu giao dien (dang nhap / xem)
    await call('gemini_web_open')
    assert.equal((await st()).geminiWeb.open, true)
    console.log('E2E GEMINI PASSED')
  }, dataDir)
})()
