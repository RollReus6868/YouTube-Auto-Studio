// Kiem tung bo chon cua src/flows/optimize.js tren HTML THAT cua Studio / YouTube (nguoi dung luu ngay 26/10/2026).
// Trang tinh (khong co script cua Studio) nen chi kiem "tim thay dung phan tu", khong bam.
const assert = require('assert')
const { LABELS: L, SEL, WATCH, _t } = require('../../src/flows/optimize')
const ot = require('../../src/optimize-template')

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

  ['HTML that (yt-3): quet (inspectVideo) doc dung gia tri hien tai cua video', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/chi-tiet`)
    const o = { timeout: 3000 }
    const read = {}
    const bad = []
    for (const k of ['description', 'playlists', 'paidPromotion', 'ai', 'remix', 'tags', 'language', 'recordingDate', 'location', 'license', 'embeddable', 'category', 'comments']) {
      try { read[k] = await _t.READ[k](page, o) } catch (e) { bad.push(`${k}: ${e.message}`) }
    }
    const title = await _t.READ.title(page)
    console.log(JSON.stringify({ ...read, description: read.description && read.description.slice(0, 40) }))
    assert.deepEqual(bad, [], bad.join('\n'))
    assert.deepEqual(read.playlists, { text: '2 danh sách phát', count: 2 })
    assert.equal(read.recordingDate, '2 thg 8, 2026')
    assert.equal(read.location, '', 'vi tri trong (nhan "Vị trí video" NFD)')
    assert.match(read.description, /^EBED MELECH 2026/)
    assert.deepEqual([read.paidPromotion, read.ai, read.remix], ['', 'yes', 'none'], 'quang cao tra phi chua chon, AI = Co, khong cho phoi lai')
    assert(read.tags.includes('Dark Bible Movie') && read.tags.length >= 2, JSON.stringify(read.tags))
    assert.deepEqual(read.language, ['Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Hoa Kỳ)'])
    assert.deepEqual(read.license, { value: 'youtube', locked: false })
    assert.deepEqual([read.embeddable, read.category, read.comments], [true, 'Mọi người và blog', 'on'])
    // so voi mau mac dinh: video da o 2 danh sach phat = xong (khong can du 3, khong mo hop thoai)
    const r = ot.compareFields(read, ot.defaultTemplate(), { title })
    assert.deepEqual(r.missing, ['paidPromotion', 'location'], JSON.stringify(r))
    assert(r.filled.includes('playlists'))
    assert.deepEqual(r.unknown, ['endScreen'])
    assert(r.filled.includes('tags'), 'tieu de da co trong the (khong phan biet hoa thuong)')
  }],

  // Gia lap Studio o ngon ngu khac: xoa chu cua moi nhan co ma co dinh (any) -> phai tim duoc chi bang id / name
  ['HTML that: moi muc tim duoc chi bang ma co dinh cua Studio (khong dua vao chu, moi ngon ngu)', async ({ page, urls }) => {
    page.timeout = 3000
    const saved = {}
    for (const [k, v] of Object.entries(L)) if (v && v.any) { saved[k] = { text: v.text, regex: v.regex }; Object.assign(v, { text: '\u0000', regex: '^\u0000$' }) }
    try {
      assert(Object.keys(saved).length >= 20, 'so nhan co ma co dinh: ' + Object.keys(saved).length)
      await page.goto(`${urls.studio}/that-optimize/chi-tiet`)
      const o = { timeout: 3000 }
      const read = {}
      const bad = []
      for (const k of ['playlists', 'paidPromotion', 'ai', 'remix', 'language', 'recordingDate', 'location', 'license', 'embeddable', 'category', 'comments']) {
        try { read[k] = await _t.READ[k](page, o) } catch (e) { bad.push(`${k}: ${e.message}`) }
      }
      console.log(JSON.stringify(read))
      assert.deepEqual(bad, [], bad.join('\n'))
      assert.equal(read.playlists.count, 2)
      assert.deepEqual([read.paidPromotion, read.ai, read.remix, read.recordingDate, read.location], ['', 'yes', 'none', '2 thg 8, 2026', ''])
      assert.deepEqual(read.language, ['Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Hoa Kỳ)'])
      assert.deepEqual([read.license.locked, read.embeddable, read.category], [false, true, 'Mọi người và blog'])
      for (const k of ['details', 'paidYes', 'paidNo', 'aiYes', 'aiNo', 'remixAll', 'remixAudio', 'remixNone', 'endScreen', 'save', 'embed']) assert.equal(await page.count(L[k]), 1, k)
      assert.equal(await page.eval((s) => window.__ya.count({ selector: s.advanced }) > 0, SEL), true, 'nhan ra muc nang cao dang mo')
      await page.goto(`${urls.studio}/that-optimize/danh-sach-phat`)
      assert.equal(await page.count({ ...L.done, within: SEL.dialogs }), 1, 'nut Xong')
      await page.goto(`${urls.studio}/that-optimize/man-hinh-ket-thuc`)
      assert(await _t.markDialog(page, L.esEditor, 'es'), 'hop thoai man hinh ket thuc')
      for (const k of ['esElements', 'esCancel', 'save']) assert(await page.count({ ...L[k], within: _t.sec('es') }) >= 1, k)
    } finally { for (const [k, v] of Object.entries(saved)) Object.assign(L[k], v) }
  }],

  ['HTML that (yt-4): hop thoai danh sach phat', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/danh-sach-phat`)
    const items = await _t.playlistItems(page)
    console.log(JSON.stringify(items))
    assert(items.length >= 2 && items.every((x) => x.name), 'doc ten tung danh sach phat')
    // tu chon 3 danh sach dau: chi co o tich danh sach phat (nut "Danh sach phat moi" khong phai o tich)
    assert.deepEqual(items.map((x) => [x.name, x.on]), [['Dark Bible Movie', true], ['Bible Movie', true], ['LIVE', false]])
    assert(await page.count({ ...L.done, within: SEL.dialogs }), 'nut Xong')
    // quet: video da o >= 1 danh sach phat = xong (mau tu chon 3 cung vay)
    assert.equal(ot.compareFields({ playlists: { count: 2, items } }, { playlistAuto: 3 }).filled.includes('playlists'), true)
    assert.equal(ot.compareFields({ playlists: { count: 0, items: items.map((x) => ({ ...x, on: false })) } }, { playlistAuto: 3 }).missing.includes('playlists'), true)
    assert.deepEqual(ot.compareFields({ playlists: { count: 2, items } }, { playlistAuto: 2 }).filled.includes('playlists'), true)
    assert.deepEqual(ot.compareFields({ playlists: { count: 2, items } }, { playlistAuto: 0, playlists: ['Bible Movie'] }).filled.includes('playlists'), true)
  }],

  ['HTML that (yt-5): trinh chinh man hinh ket thuc', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/man-hinh-ket-thuc`)
    await _t.markDialog(page, L.esEditor, 'es')
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

  ['HTML that (yt-10): trang xem video - bo chon dung de KIEM LAI (tac gia, ghim, kenh dang binh luan, sap xep)', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-video`)
    const W = WATCH
    const r = {
      comments: await page.count({ selector: W.comments }),
      threads: await page.count({ selector: W.thread, within: W.comments }),
      signIn: await page.count(W.signIn), // da dang nhap: khong co nut "Dang nhap"
      commentsOff: await page.count(W.commentsOff),
      sortMenu: await page.count(W.sortMenu),
      newest: await page.count(W.newest),
      identity: await _t.commentIdentity(page),
      // cua nguoi xem: a#author-text[href=/@handle], #author-comment-badge rong, #pinned-comment-badge rong
      viewer: await _t.scanThreads(page, 'Bình luận mẫu 1', { handle: '@nguoixem3' }),
      notMine: await _t.scanThreads(page, 'Bình luận mẫu 1', { name: 'Dark Bible Movie', handle: '@DarkBibleMovie' }),
      badges: await page.eval((s) => window.__ya.find({ selector: s.thread, within: s.comments }, true).map((t) => [t.querySelector(s.top + ' ' + s.authorBadge), t.querySelector(s.top + ' ' + s.pinnedBadge)].map((b) => (b ? b.innerText.trim() : null)).join('|')), W),
      likePressed: await page.eval((t) => { const el = window.__ya.one(t); return el && el.getAttribute('aria-pressed') }, { ...L.like, selector: SEL.likeButton }),
    }
    console.log(JSON.stringify(r, null, 1).slice(0, 3000))
    assert.equal(r.comments, 1, 'chi lay khung binh luan chinh (bo ban sao trong engagement panel)')
    assert.equal(r.threads, 8)
    assert.deepEqual([r.signIn, r.commentsOff], [0, 0])
    assert(r.sortMenu >= 1 && r.newest >= 1, 'menu "Sắp xếp bình luận" + muc "Mới nhất"')
    assert.equal(r.identity, 'Dark Bible Movie', 'o binh luan: anh dai dien alt = ten kenh dang binh luan')
    assert.deepEqual([r.viewer.count, r.viewer.match && r.viewer.match.author, r.viewer.match && r.viewer.match.mine, r.viewer.match && r.viewer.match.creator, r.viewer.match && r.viewer.match.pinned], [8, '@nguoixem3', true, false, false])
    assert.deepEqual([r.notMine.match, r.notMine.other && r.notMine.other.author], [null, '@nguoixem3'], 'cung chu nhung khong phai kenh -> khong tinh')
    assert.deepEqual([r.viewer.first.pinned, r.notMine.first.ours], [false, false], 'luot dau khong ghim')
    assert(r.badges.every((b) => b === '|'), 'huy hieu chu kenh + ghim rong khi khong co: ' + r.badges)
    assert.equal(r.likePressed, 'false')
  }],

  // ---- HTML luu ngay 27/10/2026 (vi tri, ngay quay, binh luan/ghim tung buoc) ----
  ['HTML that: goi y vi tri (United States nam sau "Khong co" va dong ke)', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/vi-tri-goi-y`)
    await _t.markSection(page, L.location, 'loc', 'input')
    const idx = (loc) => page.eval((loc, s) => {
      const opts = window.__ya.find({ selector: s.option, within: s.listbox }, true)
      return [opts.length, opts.findIndex((o) => {
        const b = o.querySelector('b, .main-text, #main-text')
        return window.__ya.norm(b ? b.innerText : String(o.innerText || '').split('\n')[0]) === loc
      })]
    }, loc, SEL)
    const r = { input: await page.count({ selector: 'input', within: _t.sec('loc') }), us: await idx('united states'), uk: await idx('united kingdom'), none: await idx('atlantis') }
    console.log(JSON.stringify(r))
    assert.equal(r.input, 1)
    assert(r.us[0] >= 3 && r.us[1] >= 1, 'thay United States trong goi y: ' + JSON.stringify(r))
    assert(r.uk[1] > r.us[1])
    assert.equal(r.none[1], -1)
  }],

  ['HTML that: lich chon ngay quay (o "Nhập ngày", nut thang, o ngay)', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/ngay-quay-lich`)
    const r = await page.eval((s) => {
      const dp = { selector: s.datePicker, hidden: true }
      const months = window.__ya.find({ selector: s.calMonth, within: dp }, true).map((m) => m.getAttribute('aria-label'))
      const aug = window.__ya.find({ selector: s.calMonth, within: dp }, true).find((m) => m.getAttribute('aria-label') === 'thg 8 2026')
      const days = aug ? [...aug.querySelectorAll(s.calDay)] : []
      return {
        input: window.__ya.count({ selector: s.dateInput }),
        label: (window.__ya.one({ selector: 'ytcp-date-picker #textbox', hidden: true }) || { getAttribute: () => '' }).getAttribute('aria-label'),
        form: window.__ya.count({ selector: s.datePicker + ' form', hidden: true }),
        prev: window.__ya.count({ selector: s.calPrev, within: dp }), next: window.__ya.count({ selector: s.calNext, within: dp }),
        months, real: days.filter((d) => !d.classList.contains('invisible')).length,
        selected: days.filter((d) => d.classList.contains('selected')).map((d) => d.textContent.trim()),
      }
    }, SEL)
    console.log(JSON.stringify(r))
    assert.deepEqual([r.input >= 1, r.label, r.form, r.prev, r.next], [true, 'Nhập ngày', 1, 1, 1])
    assert(r.months.includes('thg 8 2026') && r.months.includes('thg 9 2026'))
    assert.equal(r.real, 31)
    assert.deepEqual(r.selected, ['2'])
    assert.equal(ot.fmtStudioDate(new Date(2026, 7, 2)), await _t.triggerInfo(page, L.recDate).then((x) => x.lines.find((l) => /thg/.test(l))))
  }],

  ['HTML that: dang go binh luan (o soan, nut Binh luan, kenh dang binh luan)', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-dang-go`)
    const r = { editor: await page.count({ selector: SEL.editor }), submit: await page.count({ ...L.submitComment, selector: SEL.submit }), identity: await _t.commentIdentity(page) }
    console.log(JSON.stringify(r))
    assert(r.editor >= 1 && r.submit >= 1, JSON.stringify(r))
    assert.equal(r.identity, 'Dark Bible Movie')
  }],

  ['HTML that: menu Ghim tren binh luan cua kenh', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-menu-ghim`)
    const scan = await _t.scanThreads(page, 'ádsad', { name: 'Dark Bible Movie', handle: '@DarkBibleMovie' })
    const r = { mine: scan.match && [scan.match.author, scan.match.creator, scan.match.pinned], menuBtn: await page.count({ ...L.commentMenu, selector: 'button, [role=button]', within: '[data-ya-thread="me"]' }), pin: await page.count({ ...L.pin, within: SEL.menus }) }
    console.log(JSON.stringify(r))
    assert.deepEqual(r.mine, ['@darkbiblemovie', true, false])
    assert(r.menuBtn >= 1 && r.pin >= 1, JSON.stringify(r))
  }],

  ['HTML that: hop thoai "Ghim bình luận này?"', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-hoi-ghim`)
    assert(await _t.markDialog(page, L.pinDialog, 'pin'), 'khong thay hop thoai ghim')
    const n = await page.count({ ...L.pin, within: _t.sec('pin') })
    assert(n >= 1, 'khong thay nut Ghim trong hop thoai')
  }],

  ['HTML that: sau khi tai lai, binh luan cua kenh da ghim o dau', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/xem-da-ghim`)
    const scan = await _t.scanThreads(page, 'Donate to Us:\nhttps://ko-fi.com/dark_team_official\n\nGet the ebook here: https://darknetworkofficial.uk/', { name: 'Dark Faith', handle: '@DarkFaith8888' })
    console.log(JSON.stringify(scan.first))
    assert.deepEqual([scan.first.author, scan.first.mine, scan.first.pinned, scan.first.ours], ['@darkfaith8888', true, true, true])
    const other = await _t.scanThreads(page, 'Bình luận mẫu 1', { handle: '@DarkFaith8888' })
    assert.equal(other.match, null, 'binh luan nguoi xem khong phai cua kenh')
  }],

  ['HTML that: nut Thich - nguoi xem (like-button-view-model) va chu kenh xem video cua minh ("Bỏ thích")', async ({ page, urls }) => {
    page.timeout = 3000
    const like = { ...L.like, selector: SEL.likeButton }
    const read = () => page.eval((t) => window.__ya.find(t, true).map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]), like)
    await page.goto(`${urls.studio}/that-optimize/xem-video`)
    assert.deepEqual(await read(), [['cùng 49 người khác thích video này', 'false']], 'chi nut Thich, khong lay nut Khong thich')
    for (const name of ['xem-da-ghim', 'xem-hoi-ghim']) {
      await page.goto(`${urls.studio}/that-optimize/${name}`)
      assert.deepEqual(await read(), [['Bỏ thích', 'true']], name)
    }
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
    // quet nhieu hon 1 trang (30 hang/trang, 64 video): nut "trang tiep theo" dung mot nut va dang bam duoc
    assert.equal(await page.eval((s) => window.__ya.find({ selector: s }, true).length, SEL.next), 1, 'mot nut trang tiep theo')
    assert.equal(await page.eval((s) => window.__ya.one({ selector: s }).id, SEL.next), 'navigate-after')
    assert(await _t.isEnabled(page, { selector: SEL.next }), 'nut trang tiep theo bam duoc')
  }],

  // ---- HTML luu ngay 28/10/2026 (da an danh: ten kenh, tieu de, nguoi binh luan, ID) ----
  ['HTML that (Studio tieng Anh, video dang xu ly): quet doc dung moi muc; muc bi khoa bao ngay', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/en-chi-tiet`)
    const o = { timeout: 3000 }
    const read = {}
    const bad = []
    for (const k of ['description', 'playlists', 'paidPromotion', 'ai', 'tags', 'language', 'recordingDate', 'location', 'license', 'embeddable', 'category', 'comments']) {
      try { read[k] = await _t.READ[k](page, o) } catch (e) { bad.push(`${k}: ${e.message}`) }
    }
    const title = await _t.READ.title(page)
    console.log(JSON.stringify(read))
    assert.deepEqual(bad, [], bad.join('\n'))
    assert.equal(title, 'Seven Old Scriptures Every Reader Should Know')
    assert.deepEqual(read.playlists, { text: '2 playlists', count: 2 })
    assert.deepEqual([read.paidPromotion, read.ai], ['no', 'yes'])
    assert.deepEqual(read.tags, ['Sample Bible Channel', title])
    assert.deepEqual(read.language, ['English (United States)', 'English (United States)'])
    assert.deepEqual([read.recordingDate, read.location, read.category, read.comments, read.embeddable], ['Oct 27, 2026', 'United States', 'People & Blogs', 'on', true])
    assert.deepEqual(read.license, { value: 'youtube', locked: false })
    // "Shorts remixing" chua co nut chon, "End screen" [disabled]: bao ngay (truoc day cho 20 giay roi bao "Quá 20 giây")
    const t0 = Date.now()
    await assert.rejects(_t.READ.remix(page, o), /Video đang tải lên \/ xử lý: Studio chưa cho đổi "Phối lại cho Shorts"/)
    assert(Date.now() - t0 < 2500, 'khong cho het thoi gian')
    assert.equal(await _t.esLocked(page), true, 'lien ket "End screen" bi khoa')
    assert.equal(await _t.blocker(page), '', 'khong co hop thoai chan')
    // so voi mau mac dinh (Studio tieng Anh): moi muc mau chap nhan deu tinh la xong
    const r = ot.compareFields(read, ot.defaultTemplate(), { title })
    assert.deepEqual([r.missing, r.filled], [[], ['playlists', 'paidPromotion', 'ai', 'tags', 'recordingDate', 'location']], JSON.stringify(r))
    const all = ot.compareFields(read, { ...ot.defaultTemplate(), language: 'Tiếng Anh (Hoa Kỳ)', category: '22', comments: 'on', license: 'youtube', embeddable: 'yes', description: 'x' }, { title })
    assert.deepEqual(all.missing, [], JSON.stringify(all))
  }],

  ['HTML that: hop thoai "Xác minh danh tính của bạn" -> dung video, bao nguoi dung tu xac minh', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/vi-xac-minh`)
    assert.equal(await _t.blocker(page), 'verify')
    const e = await _t.assertNotBlocked(page).then(() => null, (x) => x)
    assert(e && e.code === 'verify', 'nem loi code verify')
    assert.match(e.message, /Xác minh danh tính của bạn/)
    assert.match(e.message, /không tự xác minh/)
    assert.match(e.message, /trang Tài khoản/)
    // trang khong co hop thoai: khong bao nham
    for (const n of ['chi-tiet', 'xem-video', 'danh-sach-phat']) {
      await page.goto(`${urls.studio}/that-optimize/${n}`)
      assert.equal(await _t.blocker(page), '', n)
    }
  }],

  ['HTML that (YouTube tieng Anh): ghim binh luan - binh luan cua kenh, menu "Pin", hop thoai "Pin this comment?"', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/en-xem-ghim`)
    const scan = await _t.scanThreads(page, 'Rivers of the Garden: The Names in Genesis 2', { name: 'Sample Bible Channel', handle: '@SampleBibleChannel' })
    assert.equal(scan.count, 7)
    assert.deepEqual(scan.match && [scan.match.i, scan.match.author, scan.match.creator, scan.match.pinned], [0, '@samplebiblechannel', true, false])
    assert.equal(await _t.commentIdentity(page), 'Sample Bible Channel')
    assert.equal(await page.count({ ...L.commentMenu, selector: 'button, [role=button]', within: '[data-ya-thread="me"]' }), 1, 'nut "Action menu"')
    assert.equal(await _t.headerCount(page), 6, '"6 Comments"')
    assert.equal(await page.count(WATCH.sortMenu), 1)
    assert.equal(await page.count({ ...WATCH.newest, hidden: true }), 1, 'muc "Newest"')
    // menu va hop thoai da dong luc luu (con trong trang): chu tieng Anh van khop
    const hid = (t) => page.eval((t) => window.__ya.find(t, true).length, t)
    assert.equal(await hid({ ...L.pin, hidden: true, within: { selector: SEL.menus, hidden: true } }), 1, 'muc "Pin" trong menu binh luan')
    assert.equal(await hid({ ...L.pinDialog, selector: L.pinDialog.dlg, hidden: true }), 1, 'hop thoai "Pin this comment?"')
    assert(await hid({ ...L.pinConfirm, hidden: true, within: { selector: L.pinDialog.dlg, hidden: true } }) >= 1, 'nut "Pin" trong hop thoai')
    const like = await page.eval((t) => window.__ya.find(t, true).map((b) => b.getAttribute('aria-pressed')), { ...L.like, selector: SEL.likeButton })
    assert.deepEqual(like, ['true'])
  }],

  ['HTML that (YouTube tieng Viet): video co phat lai tro chuyen, 2 binh luan - da tai het thi khong can doi "Mới nhất"', async ({ page, urls }) => {
    page.timeout = 3000
    await page.goto(`${urls.studio}/that-optimize/vi-xem-chat-replay`)
    const scan = await _t.scanThreads(page, 'Bình luận của kênh', { name: 'Sample Faith Channel', handle: '@SampleFaithChannel' })
    assert.deepEqual([scan.count, scan.match, scan.other], [2, null, null])
    assert.equal(await _t.headerCount(page), 2, 'tieu de "2 bình luận" = so luot da tai -> khong doi sap xep')
    assert.equal(await _t.commentIdentity(page), 'Sample Faith Channel')
    assert.equal(await page.count({ selector: WATCH.comments }), 1)
    assert.equal(await page.count(L.addComment) >= 1, true)
    // menu "Sắp xếp theo" (tp-yt-iron-dropdown position: fixed, dang dong): mo ra thi thay "Mới nhất"
    assert.equal(await page.count(WATCH.sortMenu), 1)
    assert.equal(await page.count(WATCH.newest), 0, 'menu dang dong')
    await page.eval(() => { document.querySelector('ytd-comments#comments #sort-menu tp-yt-iron-dropdown').style.display = 'block' })
    assert.equal(await page.count(WATCH.newest), 1)
  }],
]
