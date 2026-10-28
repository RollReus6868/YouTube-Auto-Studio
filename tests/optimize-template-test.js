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
  assert.deepEqual(ot.touchedFields(ot.defaultTemplate()).sort(), ['ai', 'comment', 'endScreen', 'like', 'location', 'paidPromotion', 'playlists', 'recordingDate', 'remix', 'tags'].sort())
  const keep = { playlists: [], playlistAuto: 0, paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', like: false, comment: '', pin: false }
  assert.deepEqual(ot.touchedFields(keep), [])
})

test('tu chon danh sach phat dau tien (playlistAuto)', () => {
  assert.equal(ot.defaultTemplate().playlistAuto, 3)
  assert.equal(ot.normalizeTemplate({ playlists: ['A'] }).playlistAuto, 3, 'mau cu chua co -> 3')
  assert.deepEqual([0, 2, '4', 9, -1, 2.6, 'x', ''].map((n) => ot.normalizeTemplate({ playlistAuto: n }).playlistAuto), [0, 2, 4, 5, 0, 3, 3, 3])
  assert.deepEqual(ot.touchedFields({ ...ot.defaultTemplate(), playlistAuto: 0 }).includes('playlists'), false)
})

test('quet: so gia tri doc duoc voi mau', () => {
  const full = {
    description: 'x', playlists: { count: 3 }, paidPromotion: 'no', ai: 'yes', remix: 'none', tags: ['A', 'Tieu De'], language: ['Tiếng Việt', 'Tiếng Việt'],
    recordingDate: '2 thg 8, 2026', location: 'United States', license: { value: 'youtube', locked: false }, embeddable: true, category: 'Giáo dục', comments: 'on',
  }
  const all = { ...ot.defaultTemplate(), description: 'Mô tả', language: 'Tiếng Việt', category: '27', comments: 'on', license: 'youtube', embeddable: 'yes' }
  let r = ot.compareFields(full, all, { title: 'tieu de' })
  assert.deepEqual([r.missing, r.unknown], [[], ['endScreen']], 'man hinh ket thuc: khong doc duoc -> khong tinh')
  assert.equal(r.filled.length, 13)
  r = ot.compareFields({ playlists: { count: 0 }, paidPromotion: '', ai: 'no', remix: 'all', tags: [], recordingDate: '', location: '' }, ot.defaultTemplate(), { title: 'T' })
  assert.deepEqual(r.missing, ['playlists', 'paidPromotion', 'ai', 'remix', 'tags', 'recordingDate', 'location'])
  // muc 'keep' bo qua; giay phep khoa khong tinh la thieu
  const keep = ot.normalizeTemplate({ playlistAuto: 0, paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep', license: 'creativeCommon' })
  assert.deepEqual(ot.compareFields({ license: { value: 'youtube', locked: true } }, keep), { missing: [], filled: ['license'], unknown: [] })
  // danh sach phat: du so tu chon / it danh sach hon N / ten trong mau
  const items = [{ name: 'A', id: 'PL1', on: true }, { name: 'B', id: 'PL2', on: true }]
  const pl = (p, t) => ot.compareFields({ playlists: p }, { ...keep, license: 'keep', ...t })
  // video da o >= 1 danh sach phat = xong (khong can hop thoai, khong can du N)
  assert.deepEqual(pl({ count: 2 }, { playlistAuto: 3 }).filled, ['playlists'], 'da o 2 danh sach: xong du mau tu chon 3')
  assert.deepEqual(pl({ count: 2, items }, { playlistAuto: 3 }).filled, ['playlists'], 'kenh chi co 2 danh sach')
  assert.deepEqual(pl({ count: 1 }, { playlistAuto: 0, playlists: ['A'] }).filled, ['playlists'], 'co ten nhung da o 1 danh sach -> xong')
  assert.deepEqual(pl({ count: 2, items: [...items, { name: 'C', on: false }] }, { playlistAuto: 0, playlists: ['C'] }).filled, ['playlists'], 'thieu C nhung da o danh sach khac -> xong')
  // chua o danh sach nao: thieu neu kenh co danh sach de tich
  const off = [{ name: 'A', id: 'PL1', on: false }, { name: 'B', id: 'PL2', on: false }]
  assert.deepEqual(pl({ count: 0, items: off }, { playlistAuto: 3 }).missing, ['playlists'])
  assert.deepEqual(pl({ count: 0, items: off }, { playlistAuto: 0, playlists: ['B'] }).missing, ['playlists'])
  assert.deepEqual(pl({ count: 0, items: off }, { playlistAuto: 0, playlists: ['Không có'] }).filled, ['playlists'], 'ten khong co trong kenh -> khong tinh la thieu')
  assert.deepEqual(pl({ count: 0, items: [] }, { playlistAuto: 3 }).filled, ['playlists'], 'kenh chua co danh sach phat nao -> khong co gi de lam')
  assert.deepEqual(pl({ count: 0 }, { playlistAuto: 3 }).missing, ['playlists'], 'chua mo hop thoai, chua o danh sach nao')
  assert.deepEqual(pl(undefined, { playlistAuto: 3 }).unknown, ['playlists'])
  // man hinh ket thuc: quet doc duoc (true = da co)
  assert.deepEqual(ot.compareFields({ endScreen: true }, { ...keep, license: 'keep', endScreen: 'latest' }).filled, ['endScreen'])
  assert.deepEqual(ot.compareFields({ endScreen: false }, { ...keep, license: 'keep', endScreen: 'latest' }).missing, ['endScreen'])
  assert.deepEqual(ot.compareFields({}, ot.defaultTemplate()).unknown.length, 8, 'khong doc duoc gi -> unknown')
})

test('toi uu: chi lam muc quet bao thieu (missingTemplate)', () => {
  const all = { ...ot.defaultTemplate(), description: 'Mô tả', language: 'Tiếng Việt', category: '27', comment: 'Xem {link}', like: true, pin: true }
  let t = ot.missingTemplate(all, ['playlists', 'location'])
  assert.deepEqual(ot.studioFields(t), ['playlists', 'location'])
  assert.equal(t.playlistAuto, 3)
  assert.equal(t.location, all.location)
  assert.deepEqual([t.like, t.comment, t.pin], [false, '', false], 'da tung toi uu tren trang xem: khong thich / binh luan lai')
  t = ot.missingTemplate(all, ['tags', 'ai', 'category', 'ghim'])
  assert.deepEqual(ot.studioFields(t).sort(), ['ai', 'category', 'tags'])
  assert.equal(t.tagsMode, all.tagsMode)
  assert.deepEqual([t.like, !!t.comment, t.pin], [false, true, true], 'con thieu ghim: binh luan (khong dang trung) + ghim')
  t = ot.missingTemplate(all, [], { watch: true })
  assert.deepEqual(ot.studioFields(t), [], 'muc Studio da du')
  assert.deepEqual([t.like, !!t.comment, t.pin], [true, true, true], 'chua tung lam tren trang xem: thich / binh luan / ghim')
  assert.deepEqual(ot.studioFields(ot.missingTemplate(all, ['thích'])), [])
  assert.equal(ot.missingTemplate(all, ['thích']).like, true)
  assert.deepEqual(ot.studioFields(all).includes('like'), false)
})

test('Studio tieng Anh: ten danh muc / ngon ngu / lua chon', () => {
  assert.deepEqual(Object.keys(ot.CATEGORY_NAMES_EN), Object.keys(ot.CATEGORY_NAMES), 'cung cac danh muc')
  assert.deepEqual([22, 27, 1, 2, 10, 15, 17, 19, 20, 23, 24, 25, 26, 28, 29].map((k) => ot.CATEGORY_NAMES_EN[k]), [
    'People & Blogs', 'Education', 'Film & Animation', 'Autos & Vehicles', 'Music', 'Pets & Animals', 'Sports', 'Travel & Events', 'Gaming',
    'Comedy', 'Entertainment', 'News & Politics', 'Howto & Style', 'Science & Technology', 'Nonprofits & Activism'])
  assert.deepEqual(Object.keys(ot.LANGUAGE_EN), ot.STUDIO_LANGUAGES, 'moi ngon ngu deu co ten tieng Anh')
  assert.deepEqual(['Tiếng Anh (Hoa Kỳ)', 'Tiếng Việt', 'Tiếng Anh', 'Tiếng Anh (Vương quốc Anh)', 'Tiếng Trung (Giản thể)', 'Tiếng Bồ Đào Nha (Brazil)'].map((k) => ot.LANGUAGE_EN[k]),
    ['English (United States)', 'Vietnamese', 'English', 'English (United Kingdom)', 'Chinese (Simplified)', 'Portuguese (Brazil)'])
  assert.deepEqual(ot.optionNames('category', '27'), ['Giáo dục', 'Education'])
  assert.deepEqual(ot.optionNames('category', 22), ['Mọi người và blog', 'People & Blogs'])
  assert.deepEqual([ot.optionNames('category', 'keep'), ot.optionNames('category', '999')], [[], []])
  assert.deepEqual(ot.optionNames('language', 'Tiếng Việt'), ['Tiếng Việt', 'Vietnamese'])
  assert.deepEqual(ot.optionNames('language', ' english (united states) '), ['Tiếng Anh (Hoa Kỳ)', 'English (United States)'], 'go ten tieng Anh cung duoc')
  assert.deepEqual(ot.optionNames('language', 'Tiếng Ý'), ['Tiếng Ý'], 'ngoai danh sach: giu chu nguoi dung go')
  assert.deepEqual(ot.optionNames('language', ''), [])
  assert.deepEqual(ot.optionNames('license', 'youtube'), ['Giấy phép chuẩn của YouTube', 'Standard YouTube License'])
  assert.deepEqual(ot.optionNames('license', 'creativeCommon'), ['Creative Commons - Ghi công', 'Creative Commons - Attribution'])
  assert.deepEqual(['on', 'pause', 'off'].map((k) => ot.optionNames('comments', k)), [['Bật', 'On'], ['Tạm dừng', 'Pause'], ['Tắt', 'Off']])
  assert.deepEqual([ot.optionNames('comments', 'keep'), ot.optionNames('la', 'x')], [[], []])
  const a = ot.optionNames('comments', 'on')
  a.push('x')
  assert.deepEqual(ot.optionNames('comments', 'on'), ['Bật', 'On'], 'tra ve ban sao')
})

test('Studio tieng Anh: ngay + nhan thang trong lich', () => {
  assert.equal(ot.fmtStudioDate(new Date(2026, 9, 26), 'vi'), '26 thg 10, 2026')
  assert.equal(ot.fmtStudioDate(new Date(2026, 9, 26), 'en'), 'Oct 26, 2026')
  assert.equal(ot.fmtStudioDate(new Date(2026, 0, 5), 'en'), 'Jan 5, 2026', 'ngay khong co so 0 o dau')
  assert.equal(+ot.parseStudioDate(ot.fmtStudioDate(new Date(2026, 4, 9), 'en')), +new Date(2026, 4, 9))
  assert.deepEqual(ot.calendarMonthLabels(new Date(2026, 9, 26)), ['thg 10 2026', 'Oct 2026', 'October 2026'])
  assert.deepEqual(ot.calendarMonthLabels(new Date(2027, 0, 1)), ['thg 1 2027', 'Jan 2027', 'January 2027'])
  const n = 2026 * 12 + 9
  assert.deepEqual(['thg 10 2026', 'Oct 2026', 'October 2026', ' october  2026 ', 'tháng 10 năm 2026', 'Oct. 2026'].map(ot.parseMonthLabel), [n, n, n, n, n, n])
  assert.equal(ot.parseMonthLabel('Sept 2026'), 2026 * 12 + 8)
  assert.equal(ot.parseMonthLabel('thg 1 1900'), 1900 * 12)
  for (const d of [new Date(2026, 1, 3), new Date(2025, 11, 31)]) for (const l of ot.calendarMonthLabels(d)) assert.equal(ot.parseMonthLabel(l), d.getFullYear() * 12 + d.getMonth(), l)
  assert.deepEqual(['', 'thg 13 2026', 'Foo 2026', 'Oct', null].map(ot.parseMonthLabel), [null, null, null, null, null])
})

test('quet: Studio tieng Anh doc ten danh muc / ngon ngu tieng Anh', () => {
  const keep = { playlistAuto: 0, paidPromotion: 'keep', ai: 'keep', tagsMode: 'keep', location: '', recordingDate: 'keep', remix: 'keep', endScreen: 'keep' }
  const t = { ...keep, category: '27', language: 'Tiếng Anh (Hoa Kỳ)' }
  assert.deepEqual(ot.compareFields({ category: 'Education', language: ['English (United States)', 'english  (united states)'] }, t).filled, ['language', 'category'])
  assert.deepEqual(ot.compareFields({ category: 'Giáo dục', language: ['Tiếng Anh (Hoa Kỳ)', 'English (United States)'] }, t).filled, ['language', 'category'], 'tron Viet / Anh')
  assert.deepEqual(ot.compareFields({ category: 'Giáo dục'.normalize('NFD'), language: ['Tiếng Anh (Hoa Kỳ)'.normalize('NFD')] }, t).filled, ['language', 'category'], 'NFD')
  assert.deepEqual(ot.compareFields({ category: 'Entertainment', language: ['English (United States)', 'English'] }, t).missing, ['language', 'category'])
  assert.deepEqual(ot.compareFields({ category: 'People & Blogs' }, { ...keep, category: '22' }).filled, ['category'])
  assert.deepEqual(ot.compareFields({ language: ['English'] }, { ...keep, language: 'English' }).filled, ['language'], 'mau go ten tieng Anh')
  // giay phep / binh luan da doi ra khoa ('youtube' | 'on' ...) nen khong phu thuoc ngon ngu
  assert.deepEqual(ot.compareFields({ license: { value: 'youtube', locked: false }, comments: 'pause' }, { ...keep, license: 'youtube', comments: 'pause' }).filled, ['comments', 'license'])
})

test('che do hien thi trong trang Noi dung (Viet / Anh)', () => {
  const kinds = ['Công khai', 'Public', 'Không công khai', 'Unlisted', 'Riêng tư', 'Private', 'Đã lên lịch', 'Scheduled', 'Đang công chiếu', 'Premiere', 'Premiered', 'Premieres', ' PUBLIC ', 'Công khai'.normalize('NFD'), '', 'Khác']
  assert.deepEqual(kinds.map(ot.visibilityKind), ['public', 'public', 'unlisted', 'unlisted', 'private', 'private', 'scheduled', 'scheduled', 'premiere', 'premiere', 'premiere', 'premiere', 'public', 'public', '', ''])
  assert.deepEqual(kinds.map(ot.canCommentVisibility), [true, true, true, true, false, false, false, false, false, false, false, false, true, true, true, false], 'chi cong khai / khong cong khai (hoac chua biet) moi binh luan')
  assert.equal(ot.canCommentVisibility(undefined), true)
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

test('mau tai len: moi preset co mau Studio rieng (preset.optimize)', () => {
  assert.deepEqual(md.defaultPreset().optimize, ot.defaultTemplate())
  assert.deepEqual(md.normalizePreset({ name: 'Cũ' }).optimize, ot.defaultTemplate(), 'preset cu -> mau goc')
  const p = md.normalizePreset({ name: 'A', optimize: { playlists: 'Dark Bible Study, Dark Bible Study, Podcast', remix: 'sai', comments: 'pause', pin: 'co', location: '  United States ' } })
  assert.deepEqual(p.optimize.playlists, ['Dark Bible Study', 'Podcast'])
  assert.equal(p.optimize.remix, 'none', 'gia tri sai -> mac dinh')
  assert.equal(p.optimize.comments, 'pause')
  assert.equal(p.optimize.pin, true)
  assert.equal(p.optimize.location, 'United States')
  assert.deepEqual(Object.keys(p.optimize), Object.keys(ot.defaultTemplate()), 'du cac muc')
  // preset cu da bat "sau khi dang: toi uu" -> lay mau toi uu mac dinh dang luu
  const saved = { default: { ...ot.defaultTemplate(), playlists: ['Kinh Thánh'], remix: 'audio' }, UCx: { ...ot.defaultTemplate(), remix: 'all' } }
  assert.deepEqual(ot.presetSeed({ optimizeAfterUpload: true }, saved), saved.default)
  assert.deepEqual(ot.presetSeed({ optimizeAfterUpload: false }, saved), ot.defaultTemplate())
  assert.deepEqual(ot.presetSeed({ optimizeAfterUpload: true }, {}), ot.defaultTemplate())
  assert.deepEqual(md.normalizePreset({ optimizeAfterUpload: true }, ot.presetSeed({ optimizeAfterUpload: true }, saved)).optimize.playlists, ['Kinh Thánh'])
  // preset da co mau thi khong bi ghi de boi seed
  assert.equal(md.normalizePreset({ optimize: { remix: 'keep' } }, saved.default).optimize.remix, 'keep')
})

test('mau tai len: Store chuyen preset cu + luu mau Studio cung preset', () => {
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const { Store } = require('../src/store')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ya-preset-'))
  const def = { ...ot.defaultTemplate(), playlists: ['Dark Bible Study'], comment: 'Cảm ơn {ten_kenh}' }
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    optimizeTemplates: { default: def },
    presets: [{ id: 'bat', name: 'Bật', optimizeAfterUpload: true }, { id: 'tat', name: 'Tắt' }],
  }))
  const st = new Store(dir)
  assert.deepEqual(st.settings.presets[0].optimize, ot.normalizeTemplate(def), 'bat -> mau toi uu mac dinh')
  assert.deepEqual(st.settings.presets[1].optimize, ot.defaultTemplate(), 'tat -> mau goc')
  const edited = st.settings.presets.map((p) => (p.id === 'tat' ? { ...p, optimize: { ...p.optimize, remix: 'audio', extraTags: 'a, b' } } : p))
  st.save({ presets: edited })
  const again = new Store(dir)
  assert.equal(again.settings.presets[1].optimize.remix, 'audio')
  assert.deepEqual(again.settings.presets[1].optimize.extraTags, ['a', 'b'])
  assert.deepEqual(again.settings.presets[0].optimize.playlists, ['Dark Bible Study'])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('sau khi dang: chi con thich / binh luan / ghim va cac muc hop thoai tai len chua dat duoc', () => {
  const tpl = { ...ot.defaultTemplate(), category: '27', license: 'creativeCommon', extraTags: ['x'], playlists: ['P'], comment: 'Cảm ơn {tieu_de}' }
  // dat du trong hop thoai, khong bat "sau khi dang" -> khong can chay gi
  assert.equal(ot.afterUploadTemplate(tpl, []), null)
  // bat -> chi thich / binh luan / ghim, cac muc khac giu nguyen
  const a = ot.afterUploadTemplate(tpl, [], { after: true })
  assert.deepEqual(ot.touchedFields(a).sort(), ['comment', 'like'])
  assert.deepEqual([a.comment, a.pin], ['Cảm ơn {tieu_de}', true])
  // muc chua dat duoc -> dat lai theo mau (danh sach phat / the cua video di kem)
  const m = ot.afterUploadTemplate(tpl, ['category', 'license', 'tags', 'playlists', 'endScreen', 'notify'], { playlists: ['Của preset'], tags: ['a, b', 'c'] })
  assert.deepEqual(ot.touchedFields(m).sort(), ['category', 'endScreen', 'license', 'playlists', 'tags'])
  assert.deepEqual([m.category, m.license, m.endScreen, m.playlistAuto], ['27', 'creativeCommon', 'latest', 3])
  assert.deepEqual(m.playlists, ['Của preset', 'P'])
  assert.deepEqual([m.tagsMode, m.extraTags], ['title', ['a  b', 'c', 'x'].map((x) => x.replace(/\s+/g, ' '))])
  assert.equal(m.like, false, 'khong bat sau khi dang: khong thich / binh luan')
  // preset sua sau khi dang: cac muc dang dat lay gia tri moi; muc giu nguyen van giu; danh sach phat theo video
  const now = { ...tpl, category: '10', license: 'youtube', remix: 'all', comment: 'Mới {tieu_de}', pin: false, playlists: ['Khác'] }
  const r = ot.refreshPending(m, now)
  assert.deepEqual([r.category, r.license, r.endScreen, r.remix, r.playlists, r.like], ['10', 'youtube', 'latest', 'keep', ['Của preset', 'P'], false])
  const r2 = ot.refreshPending(a, now)
  assert.deepEqual([r2.comment, r2.pin, r2.category], ['Mới {tieu_de}', false, 'keep'])
  assert.deepEqual(ot.refreshPending(a, null), a, 'preset da xoa: dung mau luc dang')
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
