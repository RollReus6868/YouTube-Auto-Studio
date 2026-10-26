// Kiem tra giao dien trong trinh duyet thuong (khong can Electron): chup anh sang/toi
// o 2 co cua so, bat loi console, tran ngang, nut bi cat.
//   cd ui && npx vite preview --port 4173 &      roi:  YA_BROWSER=/duong/dan/chrome node tests/verify-ui.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const URL = `http://localhost:${process.env.YA_PORT || 4173}/`
const OUT = path.join(__dirname, 'screenshots')
const PAGES = ['videos', 'presets', 'community', 'comments', 'guide', 'logs', 'update', 'settings']
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
        assert.equal(panes, p === 'community' ? 1 : 0, `${tag} ${p}: khung Studio`)
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
      // mo chi tiet video
      await page.goto(`${URL}?demo#videos`)
      await page.getByRole('button', { name: /Bí ẩn rừng sâu tập 1/ }).click()
      await page.getByText('Riêng tư → Công khai lúc').waitFor()
      await check('video-chi-tiet')
      // mau mac dinh: sua -> "Chua luu", xem truoc cap nhat, xoa mau -> hop thoai trong cot
      await page.goto(`${URL}?demo#presets`)
      await page.getByText('Đã lưu').waitFor()
      const title = page.getByLabel('Tiêu đề (bắt buộc)')
      await title.fill('{ten_video} - {ten_kenh}')
      await page.getByText('Chưa lưu').waitFor()
      await page.getByText('Bí ẩn rừng sâu - Kênh Của Tôi', { exact: true }).first().waitFor()
      await page.getByRole('radio', { name: /Cách nhau đều N giờ/ }).click()
      await page.getByLabel('Cách nhau (giờ)').waitFor()
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
      await page.getByText('Chưa lưu').waitFor()
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
