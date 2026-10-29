// Kiem tra giao dien trong trinh duyet thuong (khong can Electron): chup anh sang/toi
// o 2 co cua so, bat loi console, tran ngang, nut bi cat.
//   cd ui && npx vite preview --port 4173 &      roi:  YA_BROWSER=/duong/dan/chrome node tests/verify-ui.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const URL = `http://localhost:${process.env.YA_PORT || 4173}/`
const OUT = path.join(__dirname, 'screenshots')
const PAGES = ['accounts', 'videos', 'optimize', 'posts', 'presets', 'community', 'hometab', 'guide', 'logs', 'update', 'settings']
const WITH_PANE = new Set(['accounts', 'community'])
const problems = []
const overflow = () => {
  const bad = []
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('trang tran ngang')
  for (const el of document.querySelectorAll('button, input, select, textarea, h1, h2, [role=switch]')) {
    const r = el.getBoundingClientRect()
    const box = el.closest('main, section, aside').getBoundingClientRect()
    if (r.width && (r.right > box.right + 1 || r.left < box.left - 1)) {
      bad.push('bi cat: ' + (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30))
    }
  }
  return bad
}

function findBrowser() {
  if (process.env.YA_BROWSER) return { executablePath: process.env.YA_BROWSER }
  const base = '/opt/pw-browsers'
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(base, d, sub)
        if (fs.existsSync(p)) return { executablePath: p }
      }
    }
  }
  return { channel: 'chrome' }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch(findBrowser())
  for (const mode of ['light', 'dark']) {
    for (const [width, height] of [[1440, 900], [1100, 680]]) {
      const ctx = await browser.newContext({ viewport: { width, height } })
      await ctx.addInitScript(`localStorage.setItem('yt-auto-studio-mode', '${mode}')`)
      const page = await ctx.newPage()
      page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
      page.on('pageerror', (e) => problems.push(`pageerror: ${e}`))
      const tag = `${mode}-${width}`
      const check = async (name) => {
        problems.push(...(await page.evaluate(overflow)).map((b) => `${tag} ${name}: ${b}`))
        await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) })
      }
      // khong co backend (trang trong) va du lieu mau, moi trang
      await page.goto(URL)
      await page.waitForTimeout(300)
      await check('trong')
      for (const p of PAGES) {
        await page.goto(`${URL}?demo#${p}`)
        await page.waitForTimeout(250)
        assert.equal((await page.evaluate(() => document.documentElement.className)).includes('dark'), mode === 'dark')
        const panes = await page.locator('[data-pane]').count()
        assert.equal(panes, WITH_PANE.has(p) ? 1 : 0, `${tag} ${p}: khung Studio`)
        if (panes) {
          const box = await page.locator('[data-pane]').boundingBox()
          assert(box.width >= 380 && box.height >= 400, `${tag}: khung Studio qua nho ${JSON.stringify(box)}`)
        }
        await check(p)
      }
      // cong dong = tra loi binh luan (hop thu Studio): chon kenh, loc, the binh luan, khung Studio
      await page.goto(`${URL}?demo#community`)
      await page.getByRole('heading', { name: 'Cộng đồng' }).waitFor()
      await page.getByRole('button', { name: 'Lấy bình luận mới (2 kênh)' }).waitFor()
      assert.equal(await page.getByRole('group', { name: 'Kênh lấy bình luận' }).getByRole('button', { pressed: true }).count(), 2)
      assert.equal(await page.getByText('Bài cộng đồng').count(), 0, 'trang dang bai cu da bo')
      await page.getByLabel('Trả lời @ruthann-k2').waitFor()
      await page.getByRole('button', { name: 'Đã gửi' }).click()
      await page.getByText('Love ❤️ God bless you too!').waitFor()
      await check('community-da-gui')
      // trang chu kenh: kenh co anh dai dien hien anh that (nhu trang Tai khoan), khong anh / anh loi -> chu cai
      await page.goto(`${URL}?demo#hometab`)
      const homeRow = (name) => page.locator('li', { has: page.getByLabel(`Chọn kênh ${name}`) })
      await homeRow('Dark Faith 2nd').locator('img').waitFor()
      assert(await homeRow('Dark Bible Stories').locator('img').evaluate((i) => i.complete && i.naturalWidth > 0), `${tag}: anh dai dien Trang chu kenh`)
      assert.equal(await homeRow('28k s').locator('img').count(), 0, `${tag}: kenh khong anh -> chu cai`)
      await page.waitForFunction(() => !document.querySelector('img[src="data:image/png;base64,AAAA"]'))
      assert.equal(await homeRow('Dark Bible Study').getByText('D', { exact: true }).count(), 1, `${tag}: anh loi -> chu cai`)
      assert.equal(await page.locator('main li img').count(), 5, `${tag}: so anh dai dien o Trang chu kenh`)
      // toi uu video: chon so video quet; bam tieu de video -> trang Tai khoan (co khung Studio)
      await page.goto(`${URL}?demo#optimize`)
      assert.equal(await page.getByLabel('Số video cần quét').inputValue(), '10')
      assert.deepEqual(await page.getByLabel('Số video cần quét').locator('option').allTextContents(), ['5 video', '10 video', '20 video', '30 video', '50 video'])
      // quet toan bo: ket qua theo kenh, toi uu cac muc con thieu; kenh khong ghim duoc -> "Đã tối ưu" + ghi chu
      await page.getByRole('button', { name: 'Quét và tối ưu toàn bộ' }).waitFor()
      await page.getByRole('button', { name: 'Quét và tối ưu', exact: true }).waitFor()
      const g2 = page.getByRole('region', { name: 'Kênh Dark Faith 2nd' })
      await g2.getByText(/Xác minh danh tính của bạn/).waitFor()
      assert.equal(await page.getByRole('button', { name: /^Tối ưu mục còn thiếu/ }).count(), 0, `${tag}: gop vao nut Quét và tối ưu`)
      const g1 = page.getByRole('region', { name: 'Kênh Dark Bible Study' })
      assert.equal(await g1.getByText('đã thích và bình luận - chưa ghim').count(), 1)
      assert.equal(await g1.locator('li', { hasText: 'Tower of Babel' }).getByText('Đã tối ưu', { exact: true }).count(), 1, `${tag}: chua ghim van "Đã tối ưu"`)
      await g2.scrollIntoViewIfNeeded()
      await check('optimize-quet-toan-bo')
      const vt = page.getByRole('button', { name: /^Mở trang chỉnh sửa video The Tower of Babel/ }).first()
      assert.match(await vt.getAttribute('title'), /^Mở trang chỉnh sửa video trong Tài khoản trình duyệt/)
      await vt.hover()
      assert.equal(await vt.evaluate((el) => [getComputedStyle(el).cursor, getComputedStyle(el).textDecorationLine].join()), 'pointer,underline')
      await check('optimize-hover')
      await vt.click()
      await page.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor()
      assert(page.url().endsWith('#accounts'), page.url())
      assert.equal(await page.locator('[data-pane]').count(), 1, 'khung Studio o trang Tai khoan')
      // mo chi tiet video
      await page.goto(`${URL}?demo#videos`)
      await page.getByRole('button', { name: /Bí ẩn rừng sâu tập 1/ }).click()
      await page.getByText('Riêng tư → Công chiếu lúc').waitFor()
      await check('video-chi-tiet')
      // mau mac dinh: sua -> "Chua luu", xem truoc cap nhat, xoa mau -> hop thoai trong cot
      await page.goto(`${URL}?demo#presets`)
      await page.getByText('Đã lưu').first().waitFor()
      const title = page.getByLabel('Tiêu đề (thư mục con kiểu cũ)')
      await title.fill('{ten_video} - {ten_kenh}')
      await page.getByText('Chưa lưu').first().waitFor()
      await page.getByText('Bí ẩn rừng sâu - Kênh Của Tôi', { exact: true }).first().waitFor()
      // che do hien thi kieu Studio: Len lich -> lich (T2..CN, ngay da qua bi khoa), danh sach gio 15 phut, Mui gio
      const vn = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getDate()} thg ${d.getMonth() + 1}, ${d.getFullYear()}` }
      await page.getByRole('button', { name: vn(2), exact: true }).click() // mau demo: hom nay + 2 ngay
      const cal = page.getByRole('dialog', { name: 'Chọn ngày' })
      await cal.waitFor()
      assert.equal(await cal.getByText('T2', { exact: true }).count(), 1)
      assert.equal(await cal.getByText('CN', { exact: true }).count(), 1)
      if (new Date().getDate() > 1 && new Date(Date.now() + 2 * 864e5).getMonth() === new Date().getMonth()) assert(await cal.getByRole('button', { name: vn(-1) }).isDisabled(), 'ngay da qua bi khoa')
      await check('preset-lich')
      await cal.getByRole('button', { name: vn(3), exact: true }).click()
      await page.getByRole('button', { name: vn(3), exact: true }).waitFor()
      await page.getByLabel('Giờ', { exact: true }).click()
      await page.getByRole('option', { name: '21:15' }).click()
      await page.waitForFunction(() => document.querySelector('input[aria-label="Giờ"]').value === '21:15')
      await page.getByRole('button', { name: 'Múi giờ' }).click()
      await page.getByText(/múi giờ của máy tính/).waitFor()
      await page.getByRole('radio', { name: /Cách đều N giờ/ }).click()
      await page.getByLabel('Cách nhau (giờ)').waitFor()
      await page.getByRole('button', { name: /^Lưu hoặc xuất bản/ }).click()
      await page.getByRole('checkbox', { name: /Đặt ở chế độ Công chiếu ngay/ }).waitFor()
      await check('preset-hien-thi')
      await page.getByRole('button', { name: 'Nhân bản' }).click()
      await page.getByRole('button', { name: /Video dài \(bản sao\)/ }).waitFor()
      await page.getByRole('button', { name: 'Xóa mẫu này' }).click()
      const dlg = await page.getByRole('dialog').boundingBox()
      const main = await page.locator('main').boundingBox()
      assert(dlg.x >= main.x && dlg.x + dlg.width <= main.x + main.width, `${tag}: hop thoai ra ngoai cot chinh`)
      await check('preset-xoa')
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('dialog').count(), 0)
      // cai dat: doi chu de + luu lai sau khi tai lai
      await page.goto(`${URL}?demo#settings`)
      await page.getByLabel('Tên kênh').fill('Kênh khác')
      await page.getByText('Chưa lưu').first().waitFor()
      await page.locator('[data-theme="ocean"]').click()
      await page.waitForTimeout(200)
      await page.reload()
      const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'))
      assert(/^215 /.test(primary.trim()), primary)
      await page.locator('[data-theme="lua"]').click()
      // thanh ben mo rong / thu gon
      const before = (await page.locator('aside').boundingBox()).width
      await page.getByRole('button', { name: before < 100 ? 'Mở rộng' : 'Thu gọn' }).click()
      await page.waitForTimeout(300)
      assert.notEqual((await page.locator('aside').boundingBox()).width, before)
      await ctx.close()
    }
  }
  await browser.close()
  if (problems.length) { console.log(problems.join('\n')); process.exit(1) }
  console.log('ALL CHECKS PASSED')
})().catch((e) => { console.log(e.stack || e); process.exit(1) })
