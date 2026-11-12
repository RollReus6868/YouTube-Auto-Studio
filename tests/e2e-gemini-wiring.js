// Chay that app: Dang bai AI va "Gemini viet mo ta" dung dich vu Gemini tren trinh duyet THAT (src/gemini-web.js,
// chay trong khung ben phai) voi trang Gemini gia (tests/mock-yt/gemini, YA_GEMINI_BASE) - khong dung ctx.geminiWeb gia,
// khong co API key. Kiem: loi nhac di qua o nhap cua trang Gemini, cau tra loi (JSON trong khoi code + chu thua)
// thanh ban nhap dung loai; mo ta video ve hop thoai; khung Studio khong bi chiem.
//   xvfb-run -a -s "-screen 0 1500x950x24" node tests/e2e-gemini-wiring.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')

const waitFor = async (fn, what, ms = 60000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}
const p2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

;(async () => {
  const yt = await startMockYt()
  const srv = yt.server
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-gw-videos-'))
  fs.writeFileSync(path.join(root, 'Bí ẩn tập 7.mp4'), 'x')
  const env = {
    YA_GEMINI_BASE: `${yt.base}/gemini`, YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube,
    YA_STUDIO_URL: `${yt.urls.studio}/`, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000',
  }
  run(9471, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const st = () => call('hello')
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    srv.geminiFlags = {}
    srv.geminiPrompts = []

    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    assert.equal((await st()).settings.aiProvider, 'web', 'mac dinh Gemini tren trinh duyet')
    assert.equal((await st()).secrets.gemini, false, 'khong co API key')

    // 1. Gemini viet mo ta video (hop thoai o trang Dang video)
    await call('set_video_dir', root)
    await waitFor(async () => (await st()).scan.videos.length === 1, 'quet video')
    const vid = (await st()).scan.videos[0].id
    const DESC = 'Đoạn mở đầu về bí ẩn tập 7.\n\nĐoạn hai kể chuyện.\n\n#bian #tap7'
    srv.geminiQueue = [{ text: DESC }]
    await call('describe', { id: vid, request: 'Giọng ấm áp' })
    await waitFor(async () => { const d = (await st()).draft; return d && !d.loading }, 'gemini viet mo ta')
    let d = (await st()).draft
    assert.equal(d.error, '', d.error)
    assert.equal(d.text, DESC, 'mo ta doc dung tu trang Gemini (nhieu doan)')
    assert.equal(srv.geminiPrompts.length, 1)
    assert(srv.geminiPrompts[0].includes('Bí ẩn tập 7') && srv.geminiPrompts[0].includes('Giọng ấm áp'), srv.geminiPrompts[0])
    // chay trong khung ben phai (khong mo cua so rieng), xong tra khung lai
    assert.equal((await st()).studio.job, '', 'da nha khung Studio')
    assert.equal((await st()).geminiWeb.open, false, 'khong mo cua so Gemini rieng')
    assert(!pages().some((p) => p.url().includes('/gemini/app')), 'khung da ve Studio')
    assert((await st()).logs.some((l) => /đang viết mo-ta-.* \(khung trình duyệt bên phải\)…$/.test(l.msg)), 'chay trong khung')

    // 2. Dang bai AI: dang nhap tai khoan gia, tick kenh, Gemini (trinh duyet) viet 2 bai chu + tham do
    await call('draft_close')
    await ui.keyboard.press('Escape')
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
    const KEY = (await st()).f.accounts.list.find((a) => a.id === 'nick-thang').channels.find((c) => c.name === 'Dark Faith 2nd').key
      || 'nick-thang:Dark Faith 2nd'
    await call('settings_save', { geminiAccount: 'nick-thang' })
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    await call('aipost_save', { channels: [KEY], types: ['text', 'poll'], count: 2, from: ymd(tomorrow), to: ymd(tomorrow), times: '09:00, 20:00', imageSource: 'none', review: true })
    const JSON_REPLY = 'Here are your posts:\n\n```json\n' + JSON.stringify({ posts: [
      { type: 'text', text: 'Faith over fear today. #faith' },
      { type: 'poll', text: 'Which psalm comforts you most?', options: ['Psalm 23', 'Psalm 91', 'Psalm 46'] },
    ] }, null, 2) + '\n```\n\nHope this helps!'
    srv.geminiPrompts = []
    srv.geminiQueue = [{ text: JSON_REPLY }]
    await call('aipost_generate', {})
    await waitFor(async () => { const s = (await st()).f.aiposts; return !s.busy && s.drafts.length >= 2 }, 'gemini viet bai', 90000)
    const s = (await st()).f.aiposts
    assert.deepEqual(s.drafts.map((x) => x.type), ['text', 'poll'], JSON.stringify(s.drafts))
    assert.equal(s.drafts[0].text, 'Faith over fear today. #faith')
    assert.deepEqual(s.drafts[1].options.map((o) => o.text || o), ['Psalm 23', 'Psalm 91', 'Psalm 46'])
    assert.equal(srv.geminiPrompts.length, 1, 'mot loi nhac cho ca loat bai cua kenh')
    assert(/JSON/.test(srv.geminiPrompts[0]), 'loi nhac doi JSON')
    const logs = (await st()).logs.map((l) => l.msg)
    assert(!logs.some((m) => /API key/.test(m) && /Chưa nhập/.test(m)), 'khong doi API key')

    console.log('E2E GEMINI WIRING PASSED')
  })
})()
