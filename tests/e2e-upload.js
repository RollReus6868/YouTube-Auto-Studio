// Chay that app voi may chu Google gia lap: dang nhap kenh -> Gemini viet mo ta -> dang
// video (thumbnail, playlist, phu de) -> thu muc chuyen vao da-dang/ -> khong dang lai.
//   xvfb-run -a node tests/e2e-upload.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { run, sleep } = require('./lib')
const { startMock } = require('./google-mock')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-dang '))
const write = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data) }
const waitFor = async (fn, what, ms = 20000) => {
  for (let t = 0; t < ms; t += 250) { if (await fn()) return; await sleep(250) }
  throw new Error(`het gio cho: ${what}`)
}

;(async () => {
  const mock = await startMock()
  const dir = path.join(root, 'videos', '2030-02-01_bi-an-tap-7')
  write(path.join(dir, 'video.mp4'), Buffer.alloc(3 * 1024 * 1024 + 7, 1))
  write(path.join(dir, 'thumbnail.jpg'), fs.readFileSync(path.join(__dirname, 'fixture-thumb.jpg')))
  write(path.join(dir, 'phude.vi.srt'), '1\n00:00:01,000 --> 00:00:02,000\nXin chào\n')
  write(path.join(dir, 'info.txt'), 'Playlist: Bí ẩn\nGhi chú: rừng Amazon\n')
  write(path.join(root, 'posts', '.giu'), '')

  run(9355, { YA_GOOGLE_MOCK: mock.url, YA_NO_UPDATE_CHECK: '1' }, async ({ ui, dataDir }) => {
    const call = (cmd, payload) => ui.evaluate(([c, p]) => window.ya.call(c, p), [cmd, payload])
    await ui.getByRole('heading', { name: 'Đăng video' }).waitFor()
    await call('set_root', root)
    const card = ui.getByRole('button', { name: /bi an tap 7/ })
    await card.waitFor()
    assert(await ui.getByRole('button', { name: 'Đăng 1 video' }).isDisabled(), 'chua dang nhap kenh thi khong dang duoc')

    // dang nhap kenh
    const oauth = path.join(root, 'client.json')
    fs.writeFileSync(oauth, JSON.stringify({ installed: { client_id: '1234567890ab-x.apps.googleusercontent.com', client_secret: 'GOCSPX-x', project_id: 'p' } }))
    await call('oauth_import', oauth)
    await ui.getByRole('button', { name: 'Cài đặt', exact: true }).click()
    await ui.getByRole('button', { name: 'Đăng nhập kênh' }).click()
    await ui.getByText('Kênh Kênh Giả Lập').waitFor()
    assert(!fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8').includes('ref-1'), 'refresh token nam dang chu tran')

    // Gemini viet mo ta -> sua -> luu vao info.txt (giu cac dong khoa)
    await ui.getByLabel('Gemini API key').fill('gemini-ok')
    await ui.getByRole('button', { name: 'Lưu key' }).click()
    await ui.getByText(/Đã lưu API key/).waitFor()
    await ui.getByRole('button', { name: 'Đăng video', exact: true }).click()
    await card.click()
    await ui.getByRole('button', { name: 'Gemini viết mô tả' }).click()
    const box = ui.getByLabel('Mô tả Gemini viết')
    await box.waitFor()
    assert.equal(await box.inputValue(), 'Mô tả do Gemini viết.\n\n#a #b #c')
    assert(JSON.stringify(mock.lastGemini).includes('rừng Amazon'), 'ghi chu trong info.txt duoc gui cho Gemini')
    await box.fill('Mô tả đã sửa tay.\n#bian')
    await ui.getByRole('button', { name: 'Lưu vào info.txt' }).click()
    await waitFor(() => fs.readFileSync(path.join(dir, 'info.txt'), 'utf8').includes('Mô tả đã sửa tay.'), 'ghi info.txt')
    const info = fs.readFileSync(path.join(dir, 'info.txt'), 'utf8')
    assert(info.startsWith('Playlist: Bí ẩn\r\nGhi chú: rừng Amazon\r\n---\r\n'), JSON.stringify(info))
    await ui.getByText('Mô tả đã sửa tay.').first().waitFor()

    // dang video
    await ui.getByRole('button', { name: 'Đăng 1 video' }).click()
    await ui.getByText('Vừa đăng xong').waitFor({ timeout: 60000 })
    const v = mock.videos[0]
    assert.equal(v.bytes, 3 * 1024 * 1024 + 7)
    assert.equal(v.snippet.title, 'bi an tap 7')
    assert.equal(v.snippet.description, 'Mô tả đã sửa tay.\n#bian')
    assert.equal(v.status.privacyStatus, 'private')
    assert.equal(mock.thumbs.length, 1)
    assert.equal(mock.captions.length, 1)
    assert.equal(mock.playlists.find((p) => p.title === 'Bí ẩn').id, mock.items[0].playlistId)
    const moved = path.join(root, 'da-dang', '2030-02-01_bi-an-tap-7')
    await waitFor(() => fs.existsSync(path.join(moved, 'ket-qua.txt')), 'chuyen vao da-dang')
    assert(fs.readFileSync(path.join(moved, 'ket-qua.txt'), 'utf8').includes('https://youtu.be/vid1'))
    assert(!fs.existsSync(dir))

    // dua thu muc tro lai: tool nhan ra da dang, khong cho dang lai
    fs.cpSync(moved, dir, { recursive: true })
    await ui.getByRole('button', { name: 'Quét lại' }).first().click()
    await ui.getByText(/Đã đăng lên YouTube lúc/).waitFor()
    assert(await ui.getByRole('button', { name: 'Đăng video' }).last().isDisabled())

    // het han muc: bao loi ro rang, dung hang doi
    fs.rmSync(dir, { recursive: true })
    write(path.join(root, 'videos', '2030-02-02_tap-8', 'video.mp4'), Buffer.alloc(1000))
    mock.opts.quota = true
    await ui.getByRole('button', { name: 'Quét lại' }).first().click()
    await ui.getByRole('button', { name: 'Đăng 1 video' }).click()
    await ui.getByText(/hết hạn mức API/i).first().waitFor({ timeout: 30000 })
    console.log('E2E UPLOAD PASSED')
  }).finally(() => mock.close())
})()
