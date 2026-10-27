// Kiem tung bo chon cua src/flows/optimize.js tren HTML THAT cua Studio / YouTube (nguoi dung luu ngay 26/10/2026).
// Trang tinh (khong co script cua Studio) nen chi kiem "tim thay dung phan tu", khong bam.
const assert = require('assert')
const { LABELS: L, SEL, _t } = require('../../src/flows/optimize')

const probe = async (page, list) => {
  const bad = []
  const out = {}
  for (const [name, fn] of list) {
    try { out[name] = await fn() } catch (e) { bad.push(`${name}: ${e.message}`) }
  }
  console.log(JSON.stringify(out, null, 1).slice(0, 4000))
  assert.deepEqual(bad, [], 'khong tim thay:\n' + bad.join('\n'))
  return out
}
const secText = (page, name) => page.eval((s) => String((document.querySelector(s) || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 160), _t.sec(name))
const count = (page, t) => page.count(t)
// o chon (radio/checkbox) that ung voi chu t: [so phan tu khop, aria-checked cua o]
const box = (page, t, role) => page.eval((t, role) => {
  const all = window.__ya.find(t, true)
  const r = all[0] && (all[0].closest(role) || all[0])
  if (!all.length || !r || !r.matches(role)) throw new Error('khong ra o chon: ' + (all[0] ? all[0].outerHTML.slice(0, 120) : 'khong co ' + (t.text || t.selector)))
  return [all.length, r.getAttribute('aria-checked')]
}, t, role)

module.exports = [
  ['HTML that (yt-3): trang Chi tiet video, moi muc cua mau toi uu', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/chi-tiet`)
    const need1 = async (t, what) => { const n = await count(page, t); if (n < 1) throw new Error(`khong co ${what}`); return n }
    const r = await probe(page, [
      ['tieu de', () => page.text({ selector: SEL.title })],
      ['mo ta', () => need1({ selector: SEL.desc }, 'o mo ta')],
      ['danh sach phat', async () => { await _t.markSection(page, L.playlists, 'pl', SEL.trigger); await need1({ selector: SEL.trigger, within: _t.sec('pl') }, 'o chon'); return secText(page, 'pl') }],
      ['an bot (da mo Hien them)', () => need1(L.showLess, '"Ẩn bớt"')],
      ['quang cao tra phi', async () => { await _t.markSection(page, L.paid, 'paid', SEL.radio); return [await box(page, { ...L.paidNo, within: _t.sec('paid') }, SEL.radio), await box(page, { ...L.paidYes, within: _t.sec('paid') }, SEL.radio)] }],
      ['AI', async () => { await _t.markSection(page, L.ai, 'ai', SEL.radio); return [await secText(page, 'ai'), await box(page, { ...L.yes, within: _t.sec('ai') }, SEL.radio), await box(page, { ...L.no, within: _t.sec('ai') }, SEL.radio)] }],
      ['o nhap the', () => need1({ selector: SEL.tagInput }, 'o nhap the')],
      ['ngon ngu video', () => _t.triggerInfo(page, L.videoLanguage).then((x) => x || Promise.reject(new Error('khong co')))],
      ['ngon ngu tieu de', () => _t.triggerInfo(page, L.titleLanguage).then((x) => x || Promise.reject(new Error('khong co')))],
      ['ngay quay', () => _t.triggerInfo(page, L.recDate).then((x) => x || Promise.reject(new Error('khong co')))],
      ['vi tri', async () => { await _t.markSection(page, L.location, 'loc', 'input'); return page.eval((s) => { const i = document.querySelector(s + ' input'); return i && i.getAttribute('aria-label') }, _t.sec('loc')) }],
      ['giay phep', async () => { await _t.markSection(page, L.license, 'lic', SEL.trigger); return _t.triggerInfo(page, { selector: SEL.trigger, within: _t.sec('lic') }) }],
      ['cho phep nhung', () => box(page, L.embed, '[role=checkbox], ytcp-checkbox-lit')],
      ['phoi lai Shorts', async () => { await _t.markSection(page, L.remix, 'remix', SEL.radio); const o = []; for (const x of [L.remixAll, L.remixAudio, L.remixNone]) o.push(await box(page, { ...x, within: _t.sec('remix') }, SEL.radio)); return o }],
      ['danh muc', async () => { await _t.markSection(page, L.category, 'cat', SEL.trigger); return _t.triggerInfo(page, { selector: SEL.trigger, within: _t.sec('cat') }) }],
      ['binh luan', async () => { await _t.markSection(page, L.commentsSection, 'cmt', SEL.trigger); return _t.triggerInfo(page, { ...L.comments, within: _t.sec('cmt') }).then((x) => x || Promise.reject(new Error('khong co o Binh luan'))) }],
      ['man hinh ket thuc', () => need1(L.endScreen, '"Màn hình kết thúc"')],
      ['nut Luu', () => need1(L.save, '"Lưu"')],
    ])
    assert.equal(r['vi tri'].normalize('NFC'), 'Vị trí video', 'nhan "Vị trí video" that viet dang to hop (i + U+0323)')
    assert.deepEqual(r['quang cao tra phi'].map((x) => x[0]), [1, 1])
    assert.deepEqual(r['phoi lai Shorts'].map((x) => x[0]), [1, 1, 1])
    assert.deepEqual(r['binh luan'].lines, ['Bình luận', 'Bật'])
  }],

  ['HTML that (yt-4): hop thoai danh sach phat', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/danh-sach-phat`)
    const b = { selector: SEL.plBox, within: SEL.dialogs }
    const items = await page.eval((b) => window.__ya.find(b, true).map((cb) => {
      const it = cb.closest('li, [role=listitem], ytcp-ve') || cb.parentElement
      const lab = it.querySelector('.label-text, .checkbox-label, #checkbox-label')
      const host = cb.closest('ytcp-checkbox-lit')
      return { name: String(cb.getAttribute('aria-label') || (lab ? lab.innerText : it.innerText) || '').replace(/\s+/g, ' ').trim(), id: (host && host.getAttribute('test-id')) || '', on: cb.getAttribute('aria-checked') === 'true' }
    }), b)
    console.log(JSON.stringify(items))
    assert(items.length >= 2 && items.every((x) => x.name), 'doc ten tung danh sach phat')
    assert(await page.count({ ...L.done, within: SEL.dialogs }), 'nut Xong')
  }],

  ['HTML that (yt-5): trinh chinh man hinh ket thuc', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/man-hinh-ket-thuc`)
    await _t.markDialog(page, L.endScreen, 'es')
    const r = {}
    for (const k of ['esElements', 'esLatest', 'esCancel', 'save']) r[k] = await page.count({ ...L[k], within: _t.sec('es') })
    console.log(JSON.stringify(r))
    assert(r.esElements >= 1 && r.esCancel >= 1 && r.save >= 1, JSON.stringify(r))
  }],

  ['HTML that (yt-10): trang xem video (thich, binh luan, menu Ghim)', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-video`)
    const r = {
      like: await page.count({ ...L.like, selector: SEL.likeButton }),
      addComment: await page.count(L.addComment),
      threads: await page.count({ selector: SEL.thread }),
      content: await page.eval((s) => window.__ya.find({ selector: s.thread }, true).filter((t) => t.querySelector(s.content)).length, SEL),
      menuBtn: await page.eval((s, t) => { const th = window.__ya.find({ selector: s.thread }, true)[0]; if (!th) return 0; th.setAttribute('data-ya-thread', 'me'); return window.__ya.count({ ...t, selector: 'button, [role=button]', within: '[data-ya-thread="me"]' }) }, SEL, L.commentMenu),
      pin: await page.count({ ...L.pin, within: SEL.menus }),
    }
    console.log(JSON.stringify(r))
    for (const k of ['like', 'addComment', 'threads', 'content', 'menuBtn', 'pin']) assert(r[k] >= 1, `khong thay ${k}: ${JSON.stringify(r)}`)
  }],

  ['HTML that (yt-2): danh sach Noi dung', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/noi-dung`)
    const rows = await page.eval((s) => window.__ya.find({ selector: s.row }, true).map((r) => {
      const m = [...r.querySelectorAll('a[href]')].map((a) => /\/video\/([\w-]{6,})\/edit/.exec(a.getAttribute('href'))).find(Boolean)
      const cell = (q) => { const el = r.querySelector(q); return el ? String(el.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean) : [] }
      const t = r.querySelector(s.rowTitle)
      return { id: m && m[1], title: String((t && t.innerText) || '').trim(), vis: cell(s.vis)[0], date: cell(s.date)[0], views: cell(s.views)[0], comments: cell(s.comments)[0] }
    }), SEL)
    console.log(JSON.stringify(rows.slice(0, 3)), rows.length)
    assert(rows.length >= 1 && rows.every((r) => r.id && r.title && r.vis && r.date), JSON.stringify(rows.slice(0, 3)))
  }],
]

