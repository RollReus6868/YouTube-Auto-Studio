// Bai kiem cho src/studio/driver.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')

module.exports = [
  ['tim theo chu, bam, shadow DOM, cho phan tu', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/driver-test`, { wait: 'Lưu' })
    await page.click({ text: 'Lưu', exact: true })
    assert.equal(await page.eval(() => window.clicked), 1)
    assert.equal(await page.has('Lưu ẩn'), false, 'phan tu an khong tinh')
    await page.click('Chuyển đổi tài khoản')
    assert.equal(await page.eval(() => window.shadowClicked), true)
    await page.click('Xong') // xuat hien sau 400ms
    assert.equal(await page.eval(() => window.done), true)
    await assert.rejects(page.waitFor('Không có', { timeout: 600 }), /Quá 1 giây vẫn chưa thấy "Không có"/)
  }],
  ['go chu (input + contenteditable), chon file', async ({ page, urls, tmp }) => {
    await page.goto(`${urls.studio}/driver-test`, { wait: 'Lưu' })
    await page.type({ selector: '#i1' }, 'mới')
    assert.equal(await page.value({ selector: '#i1' }), 'mới')
    await page.type('Thêm bình luận…', 'Chào ❤️')
    assert.equal(await page.text({ selector: '#ce' }), 'Chào ❤️')
    const f = path.join(tmp, 'a.png')
    fs.writeFileSync(f, 'x')
    await page.setFiles({ selector: '#f' }, [f])
    assert.equal(await page.eval(() => document.querySelector('#f').files[0].name), 'a.png')
  }],
  ['bam phan tu bi che thi dung el.click()', async ({ page, urls }) => {
    await page.goto(`${urls.studio}/driver-test`, { wait: 'Lưu' })
    await page.eval(() => { document.querySelector('#cover').style.display = 'block' })
    await page.click({ selector: '#b1' })
    assert.equal(await page.eval(() => window.clicked), 1)
  }],
]
