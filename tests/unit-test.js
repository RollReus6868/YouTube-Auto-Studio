// Kiem thu phan xu ly khong can Electron:  node tests/unit-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sc = require('../src/scanner')
const md = require('../src/metadata')
const { Store, parseOAuthClient } = require('../src/store')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ya-ut-'))
const tests = []
const test = (name, fn) => tests.push([name, fn])
const write = (p, data = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data) }

test('doc gio dang', () => {
  assert.equal(+sc.parseWhen('2026-10-28 19:00'), +new Date(2026, 9, 28, 19, 0))
  assert.equal(+sc.parseWhen('28/10/2026 7h05'), +new Date(2026, 9, 28, 7, 5))
  assert.equal(+sc.parseWhen('2026-10-28'), +new Date(2026, 9, 28))
  assert.equal(sc.parseWhen('2026-02-30 10:00'), null)
  assert.equal(sc.parseWhen('mai nhe'), null)
})

test('ten thu muc', () => {
  assert.deepEqual(sc.parseFolderName('2026-10-28_ten-video-hay'), { date: '2026-10-28', time: null, name: 'ten video hay' })
  assert.deepEqual(sc.parseFolderName('2026-10-28_19h30_Tập 5 kỳ lạ'), { date: '2026-10-28', time: '19:30', name: 'Tập 5 kỳ lạ' })
  assert.deepEqual(sc.parseFolderName('video-khong-ngay'), { date: null, time: null, name: 'video khong ngay' })
})

test('doc info.txt', () => {
  const { info, warnings } = sc.parseInfo('﻿Tiêu đề: Tập {so_tap}: bí ẩn\nThẻ: a, b c\nGiờ đăng: 2026-11-01 20:00\nHiển thị: Không công khai\nTrẻ em: không\nKhách mời: Lan\nlink: https://x.y/z\n---\nDòng 1: có dấu hai chấm\nDòng 2\n')
  assert.equal(info.tieu_de, 'Tập {so_tap}: bí ẩn')
  assert.equal(info.the, 'a, b c')
  assert.equal(+info.gio_dang, +new Date(2026, 10, 1, 20, 0))
  assert.equal(info.hien_thi, 'unlisted')
  assert.equal(info.tre_em, false)
  assert.equal(info.vars.khach_moi, 'Lan')
  assert.equal(info.vars.link, 'https://x.y/z')
  assert.equal(info.mo_ta, 'Dòng 1: có dấu hai chấm\nDòng 2')
  assert.deepEqual(warnings, [])
  const bad = sc.parseInfo('Giờ đăng: tối mai\nHiển thị: bí mật\nMô tả:\nnội dung')
  assert.equal(bad.warnings.length, 2)
  assert.equal(bad.info.mo_ta, 'nội dung')
})

test('quet thu muc', () => {
  const root = tmp()
  assert.match(sc.scan(root).errors[0], /chưa có thư mục con/)
  sc.createSkeleton(root)
  assert(fs.existsSync(path.join(root, 'HUONG-DAN.txt')))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'video.mp4'))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'thumbnail.jpg'))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'anh-phu.png'))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'phude.vi.srt'))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'phude.srt'))
  write(path.join(root, 'videos', '2026-11-02_tap-2-hay', 'info.txt'), 'Thẻ: x\n')
  write(path.join(root, 'videos', '2026-11-01_thieu', 'ghichu.txt'))
  write(path.join(root, 'videos', '2026-11-03_hai-video', 'a.mov'))
  write(path.join(root, 'videos', '2026-11-03_hai-video', 'b.mp4'))
  write(path.join(root, 'videos', '2026-11-03_hai-video', 'bia.png'), Buffer.alloc(2 * 1024 * 1024 + 1))
  write(path.join(root, 'posts', '2026-11-01_bai', 'noidung.txt'), 'Xin chào mọi người')
  write(path.join(root, 'posts', '2026-11-01_bai', 'anh1.jpg'))
  fs.mkdirSync(path.join(root, 'posts', 'trong'))
  const r = sc.scan(root)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.videos.map((v) => v.dir), ['2026-11-01_thieu', '2026-11-02_tap-2-hay', '2026-11-03_hai-video'])
  const [thieu, ok, hai] = r.videos
  assert.match(thieu.errors[0], /Không có file video/)
  assert.deepEqual([ok.errors, ok.episode, path.basename(ok.thumbnail), ok.info.the], [[], '2', 'thumbnail.jpg', 'x'])
  assert.deepEqual(ok.subtitles.map((s) => s.lang), ['', 'vi'])
  assert.equal(path.basename(hai.video), 'a.mov')
  assert.match(hai.warnings[0], /2 file video/)
  assert.match(hai.errors[0], /lớn hơn 2 MB/)
  assert.deepEqual(r.posts.map((p) => [p.name, p.text, p.images.length, p.errors.length]), [['bai', 'Xin chào mọi người', 1, 0], ['trong', '', 0, 1]])
})

test('mau tieu de / mo ta', () => {
  const preset = { ...md.defaultPreset(), title: '{ten_video} | Tập {so_tap}', description: '{tieu_de}\nNgày {ngay}\n{hashtag}\n{khach_moi}', tags: ['phim hay', 'review'] }
  const item = { name: 'Bí ẩn rừng sâu', episode: '3', info: { vars: { khach_moi: 'Lan' } }, thumbnail: '/t.jpg' }
  const m = md.buildVideoMeta(item, preset, { now: new Date(2026, 10, 2) })
  assert.equal(m.title, 'Bí ẩn rừng sâu | Tập 3')
  assert.equal(m.description, 'Bí ẩn rừng sâu | Tập 3\nNgày 02/11/2026\n#phimhay #review\nLan')
  assert.deepEqual([m.privacy, m.publishAt, m.thumbnail], ['private', null, '/t.jpg'])
  assert.deepEqual(md.validateMeta(m), [])
  // bien rong (khong co the, khong co so tap) -> chuoi rong, khong bao "chua dien"
  const e = md.buildVideoMeta({ name: 'X', info: { vars: {} } }, md.defaultPreset())
  assert.deepEqual([e.title, e.description, md.validateMeta(e)], ['X', 'X', []])
  // len lich -> private + publishAt, ngay lay theo gio dang
  const s = md.buildVideoMeta(item, { ...preset, privacy: 'public' }, { publishAt: new Date(2026, 10, 5, 19).toISOString() })
  assert.equal(s.privacy, 'private')
  assert.match(s.description, /05\/11\/2026/)
  // info.txt ghi de
  const o = md.buildVideoMeta({ ...item, info: { tieu_de: 'Riêng', the: 'a,b', hien_thi: 'unlisted', vars: {} } }, preset)
  assert.deepEqual([o.title, o.tags, o.privacy], ['Riêng', ['a', 'b'], 'unlisted'])
})

test('kiem tra gioi han YouTube', () => {
  const base = { title: 'ok', description: '', tags: [] }
  assert.deepEqual(md.validateMeta(base), [])
  assert.equal(md.validateMeta({ ...base, title: '' }).length, 1)
  assert.match(md.validateMeta({ ...base, title: 'a'.repeat(101) })[0], /101/)
  assert.match(md.validateMeta({ ...base, title: 'a <b>' })[0], /</)
  assert.match(md.validateMeta({ ...base, description: 'ệ'.repeat(1700) })[0], /byte/)
  assert.match(md.validateMeta({ ...base, tags: Array(60).fill('abcdefghi') })[0], /Thẻ/)
  assert.match(md.validateMeta({ ...base, title: 'Tập {so_tap}' })[0], /\{so_tap\}/)
})

test('xep lich dang', () => {
  const now = new Date(2026, 10, 1, 12, 0)
  const P = (schedule) => () => ({ ...md.defaultPreset(), schedule })
  const iso = (...a) => new Date(...a).toISOString()
  // 'now': khong len lich, tru khi info co gio
  assert.deepEqual(md.planSchedule([{}, { info: { gio_dang: new Date(2026, 10, 3, 8) } }], P({ mode: 'now' }), now).map((x) => x.publishAt), [null, iso(2026, 10, 3, 8)])
  // khung gio co dinh: 19:00 va 07:00 moi ngay
  const t = md.planSchedule([{}, {}, {}], P({ mode: 'times', times: ['19:00', '07:00'] }), now).map((x) => x.publishAt)
  assert.deepEqual(t, [iso(2026, 10, 1, 19), iso(2026, 10, 2, 7), iso(2026, 10, 2, 19)])
  // cach nhau N gio
  const iv = md.planSchedule([{}, {}], P({ mode: 'interval', times: ['10:00'], intervalHours: 6 }), now).map((x) => x.publishAt)
  assert.deepEqual(iv, [iso(2026, 10, 2, 10), iso(2026, 10, 2, 16)])
  // ngay trong ten thu muc + khung gio; hai video cung ngay lay khung tiep theo
  const d = md.planSchedule([{ date: '2026-11-04' }, { date: '2026-11-04' }, { date: '2026-11-05', time: '06:15' }], P({ mode: 'times', times: ['08:00', '20:00'] }), now).map((x) => x.publishAt)
  assert.deepEqual(d, [iso(2026, 10, 4, 8), iso(2026, 10, 4, 20), iso(2026, 10, 5, 6, 15)])
  // gio da qua -> dang ngay + canh bao
  const past = md.planSchedule([{ date: '2026-10-01' }], P({ mode: 'times', times: ['08:00'] }), now)[0]
  assert.equal(past.publishAt, null)
  assert.match(past.warning, /đã qua/)
})

test('luu cai dat + preset', () => {
  const dir = tmp()
  const s = new Store(dir)
  assert.equal(s.settings.presets.length, 1)
  s.save({ root: '/x', presets: [{ name: 'Shorts', id: 'a', tags: 'x, y' }, { name: 'Dài', id: 'a' }], defaultPreset: 'khong-co' })
  const again = new Store(dir)
  assert.equal(again.settings.root, '/x')
  assert.deepEqual(again.settings.presets[0].tags, ['x', 'y'])
  assert.notEqual(again.settings.presets[0].id, again.settings.presets[1].id, 'id trung phai doi')
  assert.equal(again.settings.defaultPreset, 'a')
  assert.equal(again.settings.presets[1].schedule.mode, 'now', 'bu truong thieu')
  assert.equal(again.presetFor({ info: { preset: 'dài' } }).name, 'Dài')
  assert.equal(again.presetFor({ info: {} }).name, 'Shorts')
  s.save({ presets: [] })
  assert.equal(new Store(dir).settings.presets.length, 1, 'khong bao gio rong')
})

test('khoa bi mat', () => {
  const dir = tmp()
  const fake = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from([...v].reverse().join('')), decryptString: (b) => [...b.toString()].reverse().join('') }
  const s = new Store(dir, fake)
  s.setSecret('gemini', 'AIza-bi-mat')
  assert(!fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8').includes('bi-mat'))
  assert.equal(s.getSecret('gemini'), 'AIza-bi-mat')
  assert(s.hasSecret('gemini') && s.secretEncrypted('gemini'))
  s.setSecret('gemini', '')
  assert(!s.hasSecret('gemini'))
  const plain = new Store(tmp())
  plain.setSecret('k', 'v')
  assert.equal(plain.getSecret('k'), 'v')
  assert(!plain.secretEncrypted('k'))
})

test('file OAuth client', () => {
  const c = parseOAuthClient(JSON.stringify({ installed: { client_id: 'id.apps.googleusercontent.com', client_secret: 's', project_id: 'p' } }))
  assert.deepEqual(c, { client_id: 'id.apps.googleusercontent.com', client_secret: 's', project_id: 'p' })
  assert.throws(() => parseOAuthClient('{'), /JSON/)
  assert.throws(() => parseOAuthClient(JSON.stringify({ web: { client_id: 'a', client_secret: 'b' } })), /Desktop app/)
  assert.throws(() => parseOAuthClient('{}'), /client_id/)
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
