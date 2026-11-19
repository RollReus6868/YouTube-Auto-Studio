// Chay that app voi YouTube Studio gia: dang NHIEU video len NHIEU kenh, moi video cai dat rieng (kenh, kiem tien, hang
// cho), hai hang cho chay CUNG LUC (hang cho 1 trong khung ben phai, hang cho 2 trong cua so dang video rieng), video cung
// hang cho dang lan luot, them video vao hang cho dang chay, kenh da bat kiem tien: Bat (+ Muc do phu hop) / Tat.
//   xvfb-run -a -s "-screen 0 1500x950x24" node tests/e2e-upload-multi.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-dang-nhieu '))
const write = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data) }
const waitFor = async (fn, what, ms = 30000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}
const { ACCOUNTS } = require('./mock-yt/accounts/routes')
const CH = ACCOUNTS['athang@versee.net'].channels
const NUTSHELL = CH.find((c) => c.name === 'Dark Bible - in a Nutshell')
const ROOM = CH.find((c) => c.name === 'Dark Bible Room')

;(async () => {
  const yt = await startMockYt()
  const dir = path.join(root, 'Video')
  const vids = ['Kênh A tập 1', 'Kênh B tập 1', 'Kênh A tập 2']
  for (const n of vids) write(path.join(dir, `${n}.mp4`), Buffer.alloc(512 * 1024, 1))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000',
  }

  run(9357, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    const nav = (name) => ui.getByRole('button', { name, exact: true }).first().click()
    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    await call('set_video_dir', dir)

    // dang nhap, tick 2 kenh cung tai khoan
    await nav('Tài khoản')
    await ui.getByRole('button', { name: 'Thêm tài khoản' }).click()
    await ui.getByLabel('Tên gợi nhớ').fill('Nick Thắng')
    await ui.getByRole('button', { name: 'Thêm và đăng nhập' }).click()
    let pane
    await waitFor(() => (pane = pages().find((p) => p.url().includes('/studio/signin'))), 'khung Studio mo trang dang nhap')
    await pane.fill('#identifierId', 'athang@versee.net')
    await pane.click('#next')
    await ui.getByRole('button', { name: 'Xong, đóng lại' }).click()
    const acc = async () => (await call('hello')).f.accounts.list.find((a) => a.id === 'nick-thang')
    await waitFor(async () => { const a = await acc(); return a && a.status === 'signed-in' && a.channels.length }, 'doc kenh', 40000)
    await ui.getByLabel(`Dùng kênh ${NUTSHELL.name}`).click()
    await ui.getByLabel(`Dùng kênh ${ROOM.name}`).click()
    await waitFor(async () => (await acc()).channels.filter((c) => c.enabled).length === 2, 'tick kenh')
    const keyOf = async (name) => (await acc()).channels.find((c) => c.name === name).key
    const kA = await keyOf(NUTSHELL.name)
    const kB = await keyOf(ROOM.name)
    // ca hai kenh da bat kiem tien (trang gia: buoc Kiem tien + Muc do phu hop), tai len cham de hai video chong len nhau
    await pane.evaluate(() => { for (const k of ['monet', 'slow', 'nocheckwarn']) localStorage.setItem(`up-${k}`, 'true') })

    // trang Dang video: kenh mac dinh = kenh A; video "Kenh B tap 1": kenh rieng B, hang cho 2, tat kiem tien (qua giao dien)
    await nav('Đăng video')
    await ui.getByLabel('Kênh đăng video mặc định').selectOption({ value: kA })
    await waitFor(async () => (await call('hello')).upload.channelKey === kA, 'kenh mac dinh')
    await ui.getByLabel('Số hàng chờ chạy cùng lúc').selectOption('2')
    await waitFor(async () => (await call('hello')).settings.uploadParallel === 2, 'luu so hang cho')
    await ui.getByRole('button', { name: /Kênh B tập 1/ }).click()
    await ui.getByText('Cài đặt riêng của video này').waitFor()
    await ui.getByLabel('Kênh đăng của Kênh B tập 1').selectOption({ value: kB })
    await waitFor(async () => (await call('hello')).scan.videos.find((v) => v.name === 'Kênh B tập 1').channelKey === kB, 'kenh rieng')
    await ui.getByLabel('Hàng chờ của Kênh B tập 1').selectOption('2')
    await ui.getByLabel('Kiếm tiền của Kênh B tập 1').selectOption('off')
    await waitFor(async () => { const v = (await call('hello')).scan.videos.find((x) => x.name === 'Kênh B tập 1'); return v.queue === 2 && v.monetize === 'off' }, 'luu cai dat rieng')
    let st = await call('hello')
    const byName = (n) => st.scan.videos.find((v) => v.name === n)
    assert.deepEqual(vids.map((n) => [byName(n).channelName, byName(n).queueLabel, byName(n).monetize]), [
      [NUTSHELL.name, 'Hàng chờ 1', 'on'], [ROOM.name, 'Hàng chờ 2', 'off'], [NUTSHELL.name, 'Hàng chờ 1', 'on'],
    ])
    await ui.getByText('Tắt kiếm tiền', { exact: true }).first().waitFor()

    // dang: 2 hang cho chay cung luc
    await ui.getByRole('button', { name: 'Đăng 3 video (2 hàng chờ)' }).click()
    await ui.getByText('Hàng chờ đang chạy').waitFor()
    let both = false
    let seenRun = 0
    const t0 = Date.now()
    // them video luc dang chay: file moi -> quet lai -> "Them 1 video vao hang cho"
    write(path.join(dir, 'Kênh B tập 2.mp4'), Buffer.alloc(256 * 1024, 1))
    await call('scan')
    await waitFor(async () => (await call('hello')).scan.videos.some((v) => v.name === 'Kênh B tập 2'), 'quet video moi')
    const idB2 = (await call('hello')).scan.videos.find((v) => v.name === 'Kênh B tập 2').id
    await call('video_opts', { id: idB2, patch: { channel: kB, queue: 2 } })
    await ui.getByRole('button', { name: 'Thêm 1 video vào hàng chờ' }).click()
    while (Date.now() - t0 < 240000) {
      st = await call('hello')
      const running = Object.values(st.jobs).filter((j) => j.status === 'run')
      seenRun = Math.max(seenRun, running.length)
      if (running.length === 2) both = true
      if (st.logs.some((l) => /^Xong: đăng được/.test(l.msg))) break
      await sleep(250)
    }
    const logs = st.logs.map((l) => l.msg)
    assert(logs.some((m) => m === 'Xong: đăng được 4/4 video.'), logs.slice(-30).join('\n'))
    assert(both, `hai video tai len cung luc (toi da thay ${seenRun})`)
    assert(logs.some((m) => /^\[Luồng 2\]/.test(m)), 'hang cho 2 chay trong cua so rieng (luong 2)')
    assert(logs.some((m) => /Đã thêm 1 video vào hàng chờ đang chạy/.test(m)), logs.join('\n'))
    assert.equal(logs.filter((m) => /cùng lúc lên 2 kênh của cùng một tài khoản Google/.test(m)).length, 1, 'nhac kiem tra kenh mot lan')

    const ups = yt.events.filter((e) => e.type === 'upload')
    const up = (title) => ups.find((u) => u.title === title)
    assert.equal(ups.length, 4)
    assert.deepEqual(['Kênh A tập 1', 'Kênh A tập 2'].map((t) => [up(t).uc, up(t).monetization, up(t).adRating]), [[NUTSHELL.uc, 'ON', 'none'], [NUTSHELL.uc, 'ON', 'none']], 'kenh A: Bat kiem tien + Muc do phu hop')
    assert.deepEqual(['Kênh B tập 1', 'Kênh B tập 2'].map((t) => [up(t).uc, up(t).monetization]), [[ROOM.uc, 'OFF'], [ROOM.uc, 'ON']], 'kenh B: tap 1 Tat (rieng), tap 2 theo mau (Bat)')
    // cung hang cho: lan luot (tap 2 cua kenh A mo hop thoai sau khi tap 1 luu xong)
    const idx = (pred) => yt.events.findIndex(pred)
    const opens = yt.events.map((e, i) => [e, i]).filter(([e]) => e.type === 'upload-open')
    assert.equal(opens.length, 4)
    assert(idx((e) => e.type === 'upload' && e.title === 'Kênh A tập 1') < opens.filter(([e]) => e.uc === NUTSHELL.uc)[1][1], 'A2 sau A1')
    assert(idx((e) => e.type === 'upload' && e.title === 'Kênh B tập 1') < opens.filter(([e]) => e.uc === ROOM.uc)[1][1], 'B2 sau B1')
    // cai dat rieng cua video da dang duoc xoa
    const saved = (await call('hello')).settings.videoOpts
    assert.deepEqual(saved, {}, JSON.stringify(saved))
    await ui.getByText(/Chưa có video nào trong thư mục này/).waitFor()
    console.log('E2E UPLOAD MULTI PASSED')
  }).finally(() => yt.close())
})()
