// Chay that app (ma nguon, hoac ban dong goi qua YA_APP) voi Studio gia lap:
// chon thu muc goc -> tao thu muc mau (Cai dat) -> quet video kieu cu (videos/<thu muc>) -> sua mau -> luu khoa -> khung Studio.
// (thu muc video phang "Ten.mp4" + "Ten.jpg": tests/e2e-upload.js)
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
  await ui.getByText('Chọn thư mục chứa video cần đăng.').waitFor()

  // Kiem tra cap nhat luc mo app: HTTPS toi GitHub chay duoc (404 = repo chua co ban phat hanh -> 'none')
  let st
  await waitFor(async () => { st = await call('hello'); return !['idle', 'checking'].includes(st.update.status) }, 'kiem tra cap nhat', 60000)
  console.log('PHIEN BAN', st.version, '| CAP NHAT:', st.update.status, st.update.error)
  assert(['none', 'available'].includes(st.update.status) || st.update.error.startsWith('HTTP '), JSON.stringify(st.update))

  // 1) thu muc goc trong (chua chon thu muc video rieng -> dung thu muc goc) -> Cai dat: bam "Tao thu muc mau"
  await call('set_root', root)
  await ui.getByText(/Chưa có video nào trong thư mục này/).waitFor()
  await ui.getByText('(thư mục gốc)').waitFor()
  await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
  await ui.getByRole('button', { name: 'Tạo thư mục mẫu' }).click()
  await waitFor(() => fs.existsSync(path.join(root, 'videos')) && fs.existsSync(path.join(root, 'HUONG-DAN.txt')), 'tao thu muc mau')
  await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()

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
  await ui.getByLabel('Tiêu đề (thư mục con kiểu cũ)').fill('{ten_video} | Tập {so_tap}')
  // Mau Studio (dat trong hop thoai tai len) luu cung nut "Lưu mẫu"; muc chi co o API cu khong con
  await ui.getByRole('radiogroup', { name: 'Phối lại Shorts' }).getByRole('radio', { name: 'Chỉ âm thanh' }).click()
  await ui.getByRole('radiogroup', { name: 'Bình luận' }).getByRole('radio', { name: 'Tạm dừng' }).click()
  await ui.getByLabel('Danh mục', { exact: true }).selectOption('27')
  assert.equal(await ui.getByLabel('Danh mục', { exact: true }).count(), 1, 'danh muc chi con o Mau Studio')
  assert.equal(await ui.getByLabel('Mô tả video').count(), 0, 'mo ta lay o phan Chi tiet')
  assert.equal(await ui.getByText('Hiện số lượt thích').count(), 0)
  await ui.getByRole('button', { name: 'Lưu mẫu' }).click()
  await ui.getByText('Đã lưu', { exact: true }).waitFor()
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  assert.equal(saved.presets[0].title, '{ten_video} | Tập {so_tap}')
  assert.deepEqual([saved.presets[0].optimize.remix, saved.presets[0].optimize.comments, saved.presets[0].optimize.category, saved.presets[0].optimizeAfterUpload], ['audio', 'pause', '27', false])
  assert(!('categoryId' in saved.presets[0]) && !('syntheticMedia' in saved.presets[0]), Object.keys(saved.presets[0]).join())
  st = await call('hello')
  assert.equal(st.scan.videos.find((x) => x.dir.includes('tap-3')).meta.title, 'bi an tap 3 | Tập 3')

  // 4) khoa Gemini: luu duoc, khong nam dang chu tran trong file, giao dien khong nhan lai khoa; khong con muc YouTube API
  await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
  await ui.getByLabel('Gemini API key').fill('AIzaKHOA-BI-MAT-123')
  await ui.getByRole('button', { name: 'Lưu key' }).click()
  await ui.getByText(/Đã lưu API key/).waitFor()
  assert.equal(await ui.getByText('Kết nối YouTube API').count(), 0)
  st = await call('hello')
  const secrets = fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')
  assert(!secrets.includes('KHOA-BI-MAT'), 'khoa nam dang chu tran')
  assert(!JSON.stringify(st).includes('KHOA-BI-MAT'), 'khoa bi gui ra giao dien')
  console.log('MA HOA KHOA BANG KHO KHOA HE DIEU HANH:', st.secrets.geminiEncrypted)
  await ui.getByLabel('Tên kênh').fill('Kênh Thử')
  // backend gui trang thai moi lien tuc: chu dang go khong duoc bi xoa (loi da gap)
  await call('scan')
  await sleep(2500)
  assert.equal(await ui.getByLabel('Tên kênh').inputValue(), 'Kênh Thử')
  await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
  await waitFor(async () => (await call('hello')).settings.channel === 'Kênh Thử', 'luu ten kenh')
  // phan mo ta mac dinh (link ung ho...): nam duoi / tren mo ta rieng cua video, mo ta video cap nhat theo
  await ui.getByLabel('Phần mô tả mặc định').fill('Ủng hộ {ten_kenh}: https://example.org/ung-ho')
  await ui.getByRole('radiogroup', { name: 'Vị trí phần mô tả riêng của video' }).getByRole('radio', { name: /Dưới phần mặc định/ }).click()
  await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
  await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).descPosition === 'below', 'luu vi tri mo ta')
  st = await call('hello')
  assert.equal(st.settings.descDefault, 'Ủng hộ {ten_kenh}: https://example.org/ung-ho')
  const tap3 = () => st.scan.videos.find((x) => x.dir.includes('tap-3')).meta
  assert.deepEqual([tap3().description, tap3().descReplace], ['Ủng hộ Kênh Thử: https://example.org/ung-ho\n\nVideo có Lan.', true])
  await ui.getByRole('radiogroup', { name: 'Vị trí phần mô tả riêng của video' }).getByRole('radio', { name: /Trên phần mặc định/ }).click()
  await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
  await waitFor(async () => { st = await call('hello'); return st.settings.descPosition === 'above' }, 'doi vi tri mo ta')
  assert.equal(tap3().description, 'Video có Lan.\n\nỦng hộ Kênh Thử: https://example.org/ung-ho')
  await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
  await ui.getByRole('button', { name: /bi an tap 3/ }).click()
  await ui.getByText('Mô tả sẽ đăng').waitFor()
  await ui.getByText(/Video có Lan\.\s+Ủng hộ Kênh Thử/).waitFor()
  // che do hien thi rieng cua video nay: Len lich + Cong chieu, chon tren the video
  const visSel = ui.getByRole('combobox', { name: /^Chế độ hiển thị của bi an tap 3/ })
  assert.equal(await visSel.inputValue(), '', 'mac dinh: theo mau')
  await visSel.selectOption('schedule')
  await waitFor(async () => { st = await call('hello'); return st.scan.videos.find((x) => x.dir.includes('tap-3')).vis?.mode === 'schedule' }, 'chon len lich')
  const when = new Date(Date.now() + 3 * 86400e3); when.setHours(9, 30, 0, 0)
  const p2 = (n) => String(n).padStart(2, '0')
  await ui.getByLabel('Giờ lên lịch').fill(`${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}T09:30`)
  await ui.getByLabel('Giờ lên lịch').blur()
  await ui.getByRole('checkbox', { name: 'Công chiếu' }).click()
  await waitFor(async () => { st = await call('hello'); const m = tap3(); return m.publishAt === when.toISOString() && m.schedulePremiere }, 'luu gio len lich rieng')
  assert.equal(tap3().privacy, 'private')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).videoVis[st.scan.videos.find((x) => x.dir.includes('tap-3')).id], { mode: 'schedule', at: when.toISOString(), premiere: true })
  await visSel.selectOption('unlisted')
  await waitFor(async () => { st = await call('hello'); return tap3().privacy === 'unlisted' && !tap3().publishAt }, 'doi sang khong cong khai')
  await visSel.selectOption('')
  await waitFor(async () => { st = await call('hello'); return !st.scan.videos.find((x) => x.dir.includes('tap-3')).vis }, 've theo mau')
  await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
  // yeu cau mac dinh cho Gemini khi viet mo ta
  await ui.getByLabel('Yêu cầu cho Gemini khi viết mô tả').fill('Viết 1 đoạn ngắn, không hashtag')
  await ui.getByRole('button', { name: 'Lưu cài đặt' }).click()
  await waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).descRequest === 'Viết 1 đoạn ngắn, không hashtag', 'luu yeu cau Gemini')

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
  // nhat ky duoc ghi ra file (de nguoi dung gui lai khi bao loi)
  const nk = fs.readFileSync(path.join(dataDir, 'nhat-ky.txt'), 'utf8')
  assert.match(nk, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \[ok\] /m)
  assert.match(nk, /Kênh Thử|Đã vào YouTube Studio/)
  console.log('E2E APP PASSED')
})
