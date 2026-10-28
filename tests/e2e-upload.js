// Chay that app voi YouTube Studio gia (tests/mock-yt) + Gemini gia: dang nhap Google o trang Tai khoan ->
// tick kenh -> chon "Kenh dang video" -> chon thu muc video phang ("Ten.mp4" + "Ten.jpg") -> mau: Cong khai +
// Cong chieu ngay -> Gemini viet mo ta (luu "Ten.txt") -> dang video bang hop thoai tai len cua Studio
// (cua so an: thumbnail, danh sach phat, phu de, mau Studio) -> file chuyen vao da-dang/ -> khong dang lai.
//   xvfb-run -a node tests/e2e-upload.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMockYt } = require('./mock-yt/server')
const { startMock } = require('./google-mock')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-dang '))
const write = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data) }
const waitFor = async (fn, what, ms = 30000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}
const NUTSHELL = 'Dark Bible - in a Nutshell'
const UC = require('./mock-yt/accounts/routes').ACCOUNTS['athang@versee.net'].channels.find((c) => c.name === NUTSHELL).uc
const CHANNEL_DESC = 'Donate to Us: https://example.org/donate\nGet the ebook here: https://example.org/ebook'

;(async () => {
  const yt = await startMockYt()
  const gm = await startMock()
  // thu muc video phang: video + thumbnail cung ten (+ phu de), khong thu muc con, khong info.txt
  const dir = path.join(root, 'Video cần đăng')
  const NAME = 'Bí ẩn tập 7'
  const vid = path.join(dir, `${NAME}.mp4`)
  write(vid, Buffer.alloc(3 * 1024 * 1024 + 7, 1))
  write(path.join(dir, `${NAME}.jpg`), fs.readFileSync(path.join(__dirname, 'fixture-thumb.jpg')))
  write(path.join(dir, `${NAME}.vi.srt`), '1\n00:00:01,000 --> 00:00:02,000\nXin chào\n')
  // du lieu ban cu (dang qua YouTube Data API): OAuth client + token -> bo khi mo app
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-dang-e2e-'))
  const b64 = (s) => Buffer.from(s).toString('base64')
  fs.writeFileSync(path.join(dataDir, 'secrets.json'), JSON.stringify({ oauthClient: { enc: false, v: b64('{"client_id":"x"}') }, 'ytToken:UCcu00000000000000000000': { enc: false, v: b64('{"refresh_token":"ref-1"}') } }))
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ apiChannels: [{ id: 'UCcu00000000000000000000', title: 'Kênh cũ' }] }))
  const env = {
    YA_STUDIO_BASE: yt.urls.studio, YA_YOUTUBE_BASE: yt.urls.youtube, YA_STUDIO_URL: `${yt.urls.studio}/`,
    YA_GOOGLE_MOCK: gm.url, YA_NO_UPDATE_CHECK: '1', YA_LANE_IDLE_MS: '60000',
  }

  run(9355, env, async ({ ui, browser }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    const pages = () => browser.contexts().flatMap((c) => c.pages())
    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    let st = await call('hello')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')), {}, 'bo OAuth client + token API cu')
    assert(!('apiChannels' in st.settings) && !('youtube' in st), Object.keys(st).join())
    await ui.getByText('Chọn thư mục chứa video cần đăng.').waitFor()
    await call('set_video_dir', dir)
    const card = ui.getByRole('button', { name: new RegExp(NAME) })
    await card.waitFor()
    assert.equal((await call('hello')).settings.videoDir, dir)
    await ui.getByText('Thư mục video', { exact: true }).first().waitFor()
    await ui.getByText('Chưa có kênh: đăng nhập Google ở trang Tài khoản').waitFor()
    assert(await ui.getByRole('button', { name: 'Đăng 1 video' }).isDisabled(), 'chua co kenh thi khong dang duoc')

    // dang nhap Google trong khung Studio (trang Tai khoan), tick kenh
    await ui.getByRole('button', { name: 'Tài khoản', exact: true }).click()
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
    await ui.getByLabel(`Dùng kênh ${NUTSHELL}`).click()
    await ui.getByLabel('Dùng kênh Dark Bible Room').click()
    await waitFor(async () => (await acc()).channels.filter((c) => c.enabled).length === 2, 'tick kenh')
    const key = (await acc()).channels.find((c) => c.name === NUTSHELL).key

    // trang Dang video: chon kenh dang video (luu vao cai dat)
    await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
    const pick = ui.getByLabel('Kênh đăng video')
    await pick.waitFor()
    assert.deepEqual(await pick.locator('option').allTextContents(), ['Dark Bible Room (@DarkRoom6868)', `${NUTSHELL} (@Bible-inaNutshell999)`])
    await pick.selectOption({ label: `${NUTSHELL} (@Bible-inaNutshell999)` })
    await waitFor(async () => (await call('hello')).upload.channelKey === key, 'chon kenh dang video')
    await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).uploadChannel === key, 'luu kenh dang video')

    // mau mac dinh: Luu hoac xuat ban -> Cong khai + "Dat o che do Cong chieu ngay"
    await ui.getByRole('button', { name: 'Mẫu mặc định', exact: true }).click()
    await ui.getByRole('radio', { name: /^Công khai\s*Mọi người/ }).click()
    await ui.getByRole('checkbox', { name: /Đặt ở chế độ Công chiếu ngay/ }).click()
    await ui.getByRole('button', { name: 'Lưu mẫu' }).click()
    await waitFor(async () => { const p = (await call('hello')).settings.presets[0]; return p.privacy === 'public' && p.premiere === true }, 'luu mau Cong khai + Cong chieu')

    // Gemini viet mo ta (tuy chon) -> sua -> luu vao "Bi an tap 7.txt" canh video
    await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
    await ui.getByLabel('Gemini API key').fill('gemini-ok')
    await ui.getByRole('button', { name: 'Lưu key' }).click()
    await ui.getByText(/Đã lưu API key/).waitFor()
    await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
    await card.click()
    await ui.getByRole('button', { name: 'Gemini viết mô tả' }).click()
    const box = ui.getByLabel('Mô tả Gemini viết')
    await box.waitFor()
    assert.equal(await box.inputValue(), 'Mô tả do Gemini viết.\n\n#a #b #c')
    assert(JSON.stringify(gm.lastGemini).includes(NAME), 'ten video duoc gui cho Gemini')
    await box.fill('Mô tả đã sửa tay.\n#bian')
    const txt = path.join(dir, `${NAME}.txt`)
    await ui.getByRole('button', { name: `Lưu vào ${NAME}.txt` }).click()
    await waitFor(() => fs.existsSync(txt) && fs.readFileSync(txt, 'utf8').includes('Mô tả đã sửa tay.'), 'ghi file .txt cung ten')
    assert.equal(fs.readFileSync(txt, 'utf8'), '---\r\nMô tả đã sửa tay.\r\n#bian\r\n')
    await ui.getByText('Mô tả đã sửa tay.').first().waitFor()

    // dang video: hop thoai tai len cua Studio trong cua so an cua tai khoan
    await ui.getByRole('button', { name: 'Đăng 1 video' }).click()
    await waitFor(async () => /Đang (mở|chọn|điền|chờ|đặt|lưu)/.test(await ui.locator('article').first().innerText()), 'hien buoc dang lam', 30000)
    await ui.getByText('Vừa đăng xong').waitFor({ timeout: 180000 })
    const ups = yt.events.filter((e) => e.type === 'upload')
    assert.equal(ups.length, 1)
    const u = ups[0]
    assert.deepEqual([u.uc, u.cookieCh], [UC, UC], 'dang len dung kenh da chon (cua so an chuyen kenh)')
    assert.equal(u.file, `${NAME}.mp4`)
    assert.equal(u.size, 3 * 1024 * 1024 + 7)
    assert.equal(u.title, NAME, 'tieu de = ten file')
    assert.equal(u.description, `${CHANNEL_DESC}\n\nMô tả đã sửa tay.\n#bian`, 'giu mo ta mac dinh cua kenh, noi mo ta video')
    assert.equal(u.thumbnail, `${NAME}.jpg`, 'thumbnail cung ten')
    assert.deepEqual([...u.playlists].sort(), ['Bible - in a Nutshell', 'Bible - in a Nutshell (Podcast)'], 'danh sach phat tu chon cua mau')
    assert.equal(u.subtitles.length, 1)
    assert.equal(u.kids, 'NOT_MFK')
    assert.deepEqual([u.visibility, u.premiere, u.schedulePremiere], ['PUBLIC', true, false], 'Cong khai + Cong chieu ngay theo mau')
    assert.deepEqual([u.paid, u.ai, u.remix, u.location, u.endscreen], ['no', 'yes', 'Không cho phép phối lại', 'United States', 'Lấy màn hình kết thúc của video gần đây nhất'], 'mau Studio mac dinh dat trong hop thoai')
    const moved = path.join(dir, 'da-dang')
    await waitFor(() => fs.existsSync(path.join(moved, `${NAME}.ket-qua.txt`)), 'chuyen vao da-dang')
    const res = fs.readFileSync(path.join(moved, `${NAME}.ket-qua.txt`), 'utf8')
    assert(res.includes(`https://youtu.be/${u.id}`) && /Công chiếu/.test(res), res)
    assert.deepEqual(fs.readdirSync(dir), ['da-dang'], 'video, anh, phu de, .txt da chuyen di')
    assert.deepEqual(fs.readdirSync(moved).sort(), [`${NAME}.jpg`, `${NAME}.ket-qua.txt`, `${NAME}.mp4`, `${NAME}.txt`, `${NAME}.vi.srt`].sort())
    st = await call('hello')
    assert(st.logs.some((l) => /Bắt đầu đăng 1 video lên kênh "Dark Bible - in a Nutshell"/.test(l.msg)), st.logs.slice(-10).map((l) => l.msg).join('\n'))

    await ui.getByText(/Chưa có video nào trong thư mục này/).waitFor()

    // dua file video tro lai: tool nhan ra da dang (lich su), khong cho dang lai
    fs.copyFileSync(path.join(moved, `${NAME}.mp4`), vid)
    await ui.getByRole('button', { name: 'Quét lại' }).first().click()
    await ui.getByText(/Đã đăng lên YouTube lúc/).waitFor()
    assert(await ui.getByRole('button', { name: 'Đăng video' }).last().isDisabled())
    console.log('E2E UPLOAD PASSED')
  }, dataDir).finally(() => gm.close())
})()
