// Chay that app (ma nguon, hoac ban dong goi qua YA_APP) voi Studio gia lap:
// chon thu muc -> tao thu muc mau -> quet video -> sua mau -> luu khoa -> khung Studio.
//   node tests/e2e-app.js            (Linux khong man hinh: xvfb-run -a node tests/e2e-app.js)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep, MOCK_URL } = require('./lib')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-goc '))  // co dau cach nhu thu muc that
const write = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data) }
const waitFor = async (fn, what, ms = 15000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}

run(9344, {}, async ({ ui, find, dataDir }) => {
  const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
  await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
  await ui.getByText('Chọn thư mục gốc để tool quét').waitFor()

  // Kiem tra cap nhat luc mo app: HTTPS toi GitHub chay duoc (404 = repo chua co ban phat hanh -> 'none')
  let st
  await waitFor(async () => { st = await call('hello'); return !['idle', 'checking'].includes(st.update.status) }, 'kiem tra cap nhat', 60000)
  console.log('PHIEN BAN', st.version, '| CAP NHAT:', st.update.status, st.update.error)
  assert(['none', 'available'].includes(st.update.status) || st.update.error.startsWith('HTTP '), JSON.stringify(st.update))

  // 1) thu muc goc trong -> bao thieu thu muc con -> bam "Tao thu muc mau"
  await call('set_root', root)
  await ui.getByText(/chưa có thư mục con/).waitFor()
  await ui.getByRole('button', { name: 'Tạo thư mục mẫu' }).click()
  await waitFor(() => fs.existsSync(path.join(root, 'videos')) && fs.existsSync(path.join(root, 'HUONG-DAN.txt')), 'tao thu muc mau')

  // 2) them video + bai viet, quet lai
  const v = path.join(root, 'videos', '2030-01-05_bi-an-tap-3')
  write(path.join(v, 'video.mp4'), Buffer.alloc(1024))
  write(path.join(v, 'thumbnail.jpg'), fs.readFileSync(path.join(__dirname, 'fixture-thumb.jpg')))
  write(path.join(v, 'info.txt'), 'Thẻ: bí ẩn, rừng\nKhách mời: Lan\n---\nVideo có {khach_moi}.')
  write(path.join(root, 'videos', '2030-01-06_trong', 'ghichu.txt'))
  write(path.join(root, 'posts', '2030-01-07_bai-1', 'noidung.txt'), 'Chào cả nhà!')
  await ui.getByRole('button', { name: 'Quét lại' }).first().click()
  const card = ui.getByRole('button', { name: /bi an tap 3/ })
  await card.waitFor()
  await ui.getByText('Không có file video trong thư mục.').waitFor()
  // thumbnail nap duoc tu file:// (khong bi chan)
  await waitFor(() => ui.evaluate(() => [...document.images].some((i) => i.complete && i.naturalWidth > 0)), 'thumbnail hien')
  await card.click()
  await ui.getByText('Video có Lan.').waitFor()

  // 3) sua mau mac dinh, luu, file settings.json doi theo, mo ta video cap nhat
  await ui.getByRole('button', { name: 'Mẫu mặc định', exact: true }).click()
  await ui.getByLabel('Tiêu đề (bắt buộc)').fill('{ten_video} | Tập {so_tap}')
  // cac muc trong Studio luon hien (ca khi tat "sau khi dang"), luu cung nut "Lưu mẫu"
  await ui.getByRole('radiogroup', { name: 'Phối lại Shorts' }).getByRole('radio', { name: 'Chỉ âm thanh' }).click()
  await ui.getByRole('radiogroup', { name: 'Bình luận' }).getByRole('radio', { name: 'Tạm dừng' }).click()
  assert.equal(await ui.getByLabel('Mô tả video').count(), 0, 'muc da dat qua API khong lap lai')
  await ui.getByRole('button', { name: 'Lưu mẫu' }).click()
  await ui.getByText('Đã lưu', { exact: true }).waitFor()
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  assert.equal(saved.presets[0].title, '{ten_video} | Tập {so_tap}')
  assert.deepEqual([saved.presets[0].optimize.remix, saved.presets[0].optimize.comments, saved.presets[0].optimizeAfterUpload], ['audio', 'pause', false])
  st = await call('hello')
  assert.equal(st.scan.videos.find((x) => x.dir.includes('tap-3')).meta.title, 'bi an tap 3 | Tập 3')

  // 4) khoa Gemini + OAuth client: luu duoc, khong nam dang chu tran trong file, giao dien khong nhan lai khoa
  await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
  await ui.getByLabel('Gemini API key').fill('AIzaKHOA-BI-MAT-123')
  await ui.getByRole('button', { name: 'Lưu key' }).click()
  await ui.getByText(/Đã lưu API key/).waitFor()
  const oauthFile = path.join(root, 'client_secret.json')
  fs.writeFileSync(oauthFile, JSON.stringify({ installed: { client_id: '123456789012-abcdef.apps.googleusercontent.com', client_secret: 'GOCSPX-bimat', project_id: 'du-an-thu' } }))
  st = await call('oauth_import', oauthFile)
  await ui.getByText(/Dự án du-an-thu/).waitFor()
  const secrets = fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')
  assert(!secrets.includes('KHOA-BI-MAT') && !secrets.includes('GOCSPX'), 'khoa nam dang chu tran')
  assert(!JSON.stringify(st).includes('KHOA-BI-MAT') && !JSON.stringify(st).includes('GOCSPX'), 'khoa bi gui ra giao dien')
  console.log('MA HOA KHOA BANG KHO KHOA HE DIEU HANH:', st.secrets.geminiEncrypted)
  await ui.getByLabel('Tên kênh').fill('Kênh Thử')
  // backend gui trang thai moi lien tuc: chu dang go khong duoc bi xoa (loi da gap)
  await call('scan')
  await sleep(2500)
  assert.equal(await ui.getByLabel('Tên kênh').inputValue(), 'Kênh Thử')
  await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
  await waitFor(async () => (await call('hello')).settings.channel === 'Kênh Thử', 'luu ten kenh')

  // 5) trang Cong dong: khung Studio nam dung vi tri giao dien danh cho no
  await ui.getByRole('button', { name: 'Cộng đồng', exact: true }).click()
  await ui.getByRole('button', { name: /Lấy bình luận mới/ }).waitFor()
  const studio = await find('mock_studio')
  const pane = await ui.locator('[data-pane]').boundingBox()
  assert(pane.width > 300 && pane.height > 300, JSON.stringify(pane))
  await waitFor(async () => {
    const size = await studio.evaluate(() => [innerWidth, innerHeight])
    return Math.abs(size[0] - pane.width) <= 2 && Math.abs(size[1] - pane.height) <= 2
  }, 'khung Studio dung kich thuoc')
  assert.equal(await studio.evaluate(() => document.visibilityState), 'visible')
  // vao kenh -> app nhan ra ma kenh
  await studio.goto(MOCK_URL + '#/channel/UCabcdefghijklmnopqrstuv')
  await ui.getByText('YouTube Studio · UCabcdefghijklmnopqrstuv').waitFor()
  // roi sang trang khong co khung -> khung Studio an di
  await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
  await waitFor(async () => (await call('hello')).studio.visible === false, 'khung Studio an')
  if (process.env.YA_SHOT) { // chup man hinh that (Xvfb) de nhin bang mat
    await ui.getByRole('button', { name: 'Cộng đồng', exact: true }).click()
    await sleep(800)
    require('child_process').execFileSync('import', ['-window', 'root', path.join(process.env.YA_SHOT, 'app-cong-dong.png')])
    await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
    await sleep(800)
    require('child_process').execFileSync('import', ['-window', 'root', path.join(process.env.YA_SHOT, 'app-dang-video.png')])
  }
  console.log('E2E APP PASSED')
})
