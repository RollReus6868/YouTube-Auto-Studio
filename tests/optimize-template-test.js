// Kiem thu mau toi uu video (src/optimize-template.js):  node tests/optimize-template-test.js
const assert = require('assert')
const ot = require('../src/optimize-template')
const md = require('../src/metadata')

const tests = []
const test = (name, fn) => tests.push([name, fn])

test('mau mac dinh giong video quay', () => {
  const t = ot.defaultTemplate()
  assert.deepEqual([t.paidPromotion, t.ai, t.tagsMode, t.location, t.recordingDate, t.remix, t.endScreen], ['no', 'yes', 'title', 'United States', 'today', 'none', 'latest'])
  assert.deepEqual([t.category, t.language, t.comments, t.license, t.embeddable], ['keep', '', 'keep', 'keep', 'keep'], 'cac muc khac giu nguyen')
  assert.deepEqual([t.like, t.comment, t.pin], [true, '{tieu_de}', true])
})

test('chuan hoa mau', () => {
  const t = ot.normalizeTemplate({ playlists: 'Dark Bible Study, Dark Bible Study,  Bible  Stories ', ai: 'bừa', remix: 'audio', category: '27', extraTags: ['a', ' a ', 'b'], comment: ' {tieu_de}\r\n{link} ', like: false, location: '  ' })
  assert.deepEqual(t.playlists, ['Dark Bible Study', 'Bible Stories'], 'ten trung chi giu mot (tool tu tich moi danh sach trung ten)')
  assert.equal(t.ai, 'yes', 'gia tri la -> mac dinh')
  assert.deepEqual([t.remix, t.category, t.extraTags, t.comment, t.like, t.location], ['audio', '27', ['a', 'b'], '{tieu_de}\n{link}', false, ''])
  assert.equal(ot.normalizeTemplate({ category: '999' }).category, 'keep')
  assert.deepEqual(ot.normalizeTemplate(null), ot.defaultTemplate())
})

test('mau theo kenh + mau mac dinh', () => {
  let all = ot.setTemplate({}, 'default', { ai: 'no' })
  assert.equal(ot.templateFor(all, 'UCa').ai, 'no', 'kenh chua co mau -> mau mac dinh')
  all = ot.setTemplate(all, 'UCa', { ai: 'keep', playlists: ['X'] })
  assert.deepEqual([ot.templateFor(all, 'UCa').ai, ot.templateFor(all, 'UCb').ai], ['keep', 'no'])
  all = ot.setTemplate(all, 'UCa', null)
  assert.equal(all.UCa, undefined)
  assert.equal(ot.setTemplate(all, 'default', null).default.ai, 'yes', 'mau mac dinh khong xoa duoc, chi ve gia tri goc')
  assert.equal(ot.templateFor(undefined, 'x').remix, 'none')
})

test('noi dung binh luan', () => {
  const vars = { tieu_de: 'The Cost of Being Chosen by God - Matthew 22 Explained', link: 'https://youtu.be/vyiSqHByq24', ten_kenh: 'Dark Bible Study' }
  assert.equal(ot.renderComment('{tieu_de}', vars), vars.tieu_de)
  assert.equal(ot.renderComment('Xem lại: {link}\n\n\n— {ten_kenh} {la}', vars), 'Xem lại: https://youtu.be/vyiSqHByq24\n\n— Dark Bible Study {la}')
  assert.equal(ot.renderComment('', vars), '')
})

test('the can them', () => {
  const t = ot.defaultTemplate()
  assert.deepEqual(ot.tagsToAdd(['Dark Bible Study'], t, 'The Cost of Being Chosen by God - Matthew 22 Explained').add, ['The Cost of Being Chosen by God - Matthew 22 Explained'])
  assert.deepEqual(ot.tagsToAdd(['the cost'], t, 'The Cost').add, [], 'da co (khong phan biet hoa thuong) -> khong them lai')
  assert.deepEqual(ot.tagsToAdd([], { ...t, extraTags: ['x', 'y'] }, 'A, B').add, ['A B', 'x', 'y'], 'dau phay trong tieu de bi Studio tach the')
  assert.deepEqual(ot.tagsToAdd([], { ...t, tagsMode: 'keep' }, 'A').add, [])
  const full = Array(48).fill(0).map((_, i) => `tag${String(i).padStart(6, '0')}`) // 48*9 + 47 = 479 ky tu
  const r = ot.tagsToAdd(full, t, 'Một tiêu đề khá dài vượt giới hạn')
  assert.deepEqual([r.add, r.skipped], [[], ['Một tiêu đề khá dài vượt giới hạn']])
  assert.equal(ot.tagLength(['a b', 'c']), 7)
})

test('ngay kieu Studio', () => {
  assert.equal(ot.fmtStudioDate(new Date(2026, 9, 26)), '26 thg 10, 2026')
  assert.equal(+ot.parseStudioDate('25 thg 10, 2026'), +new Date(2026, 9, 25))
  assert.equal(+ot.parseStudioDate('Đã phát hành lần đầu 5 tháng 1, 2026'), +new Date(2026, 0, 5))
  assert.equal(+ot.parseStudioDate('Oct 25, 2026'), +new Date(2026, 9, 25))
  assert.equal(+ot.parseStudioDate('25/10/2026'), +new Date(2026, 9, 25))
  assert.equal(ot.parseStudioDate('31 thg 2, 2026'), null)
  assert.equal(ot.parseStudioDate('hôm qua'), null)
  const now = new Date(2026, 9, 26, 21, 9)
  assert.equal(+ot.recordingDateFor({ recordingDate: 'today' }, {}, now), +new Date(2026, 9, 26))
  assert.equal(+ot.recordingDateFor({ recordingDate: 'publish' }, { date: '25 thg 10, 2026' }, now), +new Date(2026, 9, 25))
  assert.equal(ot.recordingDateFor({ recordingDate: 'keep' }, {}, now), null)
})

test('muc mau dung toi / giu nguyen', () => {
  assert.deepEqual(ot.touchedFields(ot.defaultTemplate()).sort(), ['ai', 'comment', 'endScreen', 'like', 'location', 'paidPromotion', 'recordingDate', 'remix', 'tags'].sort())
  const keep = { playlists: [], paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', like: false, comment: '', pin: false }
  assert.deepEqual(ot.touchedFields(keep), [])
})

test('danh dau video da toi uu', () => {
  let db = ot.markOptimized({}, 'UCa', 'v1', { title: 'A', pinned: true })
  db = ot.markOptimized(db, 'UCa', 'v2')
  assert(ot.isOptimized(db, 'UCa', 'v1') && ot.isOptimized(db, 'UCa', 'v2'))
  assert(!ot.isOptimized(db, 'UCb', 'v1') && !ot.isOptimized(null, 'UCa', 'v1'))
  assert.equal(db.UCa.v1.title, 'A')
})

test('mau tai len: tuy chon tu toi uu sau khi dang', () => {
  const p = md.normalizePreset({ name: 'Cũ', id: 'x' })
  assert.equal(p.optimizeAfterUpload, false, 'preset cu -> tat')
  assert.equal(md.normalizePreset({ name: 'Mới', optimizeAfterUpload: true }).optimizeAfterUpload, true)
  assert.equal(md.normalizePreset({ optimizeAfterUpload: 'co' }).optimizeAfterUpload, false)
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
