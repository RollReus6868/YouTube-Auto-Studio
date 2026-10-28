// Kiem thu phan xu ly khong can Electron:  node tests/unit-test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sc = require('../src/scanner')
const md = require('../src/metadata')
const { Store, dropApiData } = require('../src/store')

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
  assert.deepEqual(hai.errors, []) // anh to khong con bi chan (YouTube bo gioi han 2 MB)
  assert.deepEqual(r.posts.map((p) => [p.name, p.text, p.images.length, p.errors.length]), [['bai', 'Xin chào mọi người', 1, 0], ['trong', '', 0, 1]])
})

// dau file PNG gia: chi can 24 byte dau de doc kich thuoc
const png = (w, h) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }

test('bai dang: phan dau noidung.txt', () => {
  const a = sc.parsePostText('﻿Loại: thăm dò ảnh   # chu thich\r\nGiờ đăng: 2030-10-30 08:00\r\nKênh: @DarkGrace6868\r\n---\r\nBạn thích bìa nào?\r\nDòng 2: có dấu hai chấm')
  assert.deepEqual([a.type, +a.when, a.channel, a.body, a.warnings], ['image_poll', +new Date(2030, 9, 30, 8), '@DarkGrace6868', 'Bạn thích bìa nào?\nDòng 2: có dấu hai chấm', []])
  // khong co phan dau: ca file la than bai (ke ca dong "---" va "Lich: ...")
  const b = sc.parsePostText('Lịch tuần này: thứ 3\n---\nhết')
  assert.deepEqual([b.type, b.when, b.body], ['', undefined, 'Lịch tuần này: thứ 3\n---\nhết'])
  // khong co "---": chi nhan dong dau hop le
  const c = sc.parsePostText('Video: https://youtu.be/AbCdEfGhIjK\nXem tập mới nhé')
  assert.deepEqual([c.video, c.body], ['https://youtu.be/AbCdEfGhIjK', 'Xem tập mới nhé'])
  assert.equal(sc.parsePostText('Video: tập mới ra lò!\nhay lắm').body, 'Video: tập mới ra lò!\nhay lắm')
  const d = sc.parsePostText('Loại: bài hát\nGiờ đăng:\n---\nx')
  assert.equal(d.when, null, 'gio dang trong = dang ngay')
  assert.match(d.warnings[0], /không hiểu loại bài/)
  assert.deepEqual(['https://www.youtube.com/watch?v=AbCdEfGhIjK&t=3', 'youtu.be/AbCdEfGhIjK?si=x', 'https://youtube.com/shorts/AbCdEfGhIjK', 'AbCdEfGhIjK', 'abc'].map(sc.videoId), ['AbCdEfGhIjK', 'AbCdEfGhIjK', 'AbCdEfGhIjK', 'AbCdEfGhIjK', ''])
})

test('bai dang: kich thuoc anh', () => {
  const dir = tmp()
  write(path.join(dir, 'a.png'), png(1280, 720))
  const gif = Buffer.alloc(16); gif.write('GIF89a'); gif.writeUInt16LE(300, 6); gif.writeUInt16LE(200, 8)
  write(path.join(dir, 'b.gif'), gif)
  // JPEG: SOI, APP0 (16 byte), SOF0 (cao 600, rong 800)
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20, 3, ...Array(12).fill(0)])
  write(path.join(dir, 'c.jpg'), jpg)
  write(path.join(dir, 'd.jpg'), 'khong phai anh')
  assert.deepEqual(['a.png', 'b.gif', 'c.jpg', 'd.jpg'].map((f) => sc.imageSize(path.join(dir, f))), [{ w: 1280, h: 720 }, { w: 300, h: 200 }, { w: 800, h: 600 }, null])
})

test('bai dang: 6 loai trong thu muc posts', () => {
  const root = tmp()
  const P = (dir, f, data) => write(path.join(root, 'posts', dir, f), data)
  P('2030-10-29_19h00_bai-anh', 'noidung.txt', 'Ảnh mới')
  P('2030-10-29_19h00_bai-anh', '1.jpg', png(1000, 1000))
  P('2030-10-29_19h00_bai-anh', '2.png', png(3000, 500)) // 6:1 -> canh bao ty le
  P('2030-10-29_bai-chu', 'noidung.txt', 'Chỉ có chữ')
  P('2030-10-30_08h00_tham-do', 'noidung.txt', 'Bạn thích bìa nào?')
  P('2030-10-30_08h00_tham-do', 'binhchon.txt', '# lua chon\nBìa A\n\nBìa B   # chu thich\nBìa C\n')
  P('2030-10-30_tham-do-anh', 'noidung.txt', 'Chọn ảnh')
  P('2030-10-30_tham-do-anh', 'binhchon.txt', 'Bìa A\nBìa B\nanh-c.jpg | Bìa C')
  P('2030-10-30_tham-do-anh', '2.jpg', png(500, 500))
  P('2030-10-30_tham-do-anh', '1.jpg', png(500, 500))
  P('2030-10-30_tham-do-anh', 'anh-c.jpg', png(500, 500))
  P('2030-10-31_do-vui', 'noidung.txt', 'Ai dẫn dân ra khỏi Ai Cập?')
  P('2030-10-31_do-vui', 'cauhoi.txt', '* Môi-se\nÁp-ra-ham\nĐa-vít | 3.jpg\nGiải thích: Môi-se dẫn dân Israel.\n')
  P('2030-10-31_do-vui', '3.jpg', png(400, 400))
  P('2030-11-01_gioi-thieu-video', 'noidung.txt', 'Loại: video\nVideo: https://youtu.be/AbCdEfGhIjK\nKênh: Dark Grace\n---\nXem tập mới!')
  const r = sc.scan(root)
  const by = Object.fromEntries(r.posts.map((p) => [p.dir.replace(/^[\d-]+_(\d+h\d+_)?/, ''), p]))
  assert.deepEqual(Object.keys(by).sort(), ['bai-anh', 'bai-chu', 'do-vui', 'gioi-thieu-video', 'tham-do', 'tham-do-anh'])
  const img = by['bai-anh']
  assert.deepEqual([img.type, img.when, img.images.length, img.errors], ['image', new Date(2030, 9, 29, 19).toISOString(), 2, []])
  assert.match(img.warnings.join(), /2\.png.*3000x500.*2:5 đến 5:2/)
  assert.deepEqual([by['bai-chu'].type, by['bai-chu'].when, by['bai-chu'].text], ['text', null, 'Chỉ có chữ'])
  const poll = by['tham-do']
  assert.deepEqual([poll.type, poll.text, poll.options.map((o) => o.text), poll.errors, poll.warnings], ['poll', 'Bạn thích bìa nào?', ['Bìa A', 'Bìa B', 'Bìa C'], [], []])
  const ip = by['tham-do-anh']
  assert.equal(ip.type, 'image_poll')
  assert.deepEqual(ip.options.map((o) => [o.text, path.basename(o.image)]), [['Bìa A', '1.jpg'], ['Bìa B', '2.jpg'], ['Bìa C', 'anh-c.jpg']])
  assert.deepEqual([ip.errors, ip.warnings], [[], []])
  const quiz = by['do-vui']
  assert.equal(quiz.type, 'quiz')
  assert.equal(quiz.text, 'Ai dẫn dân ra khỏi Ai Cập?', 'cauhoi.txt khong bi doc lam than bai')
  assert.deepEqual(quiz.answers.map((a) => [a.text, a.correct, path.basename(a.image || '')]), [['Môi-se', true, ''], ['Áp-ra-ham', false, ''], ['Đa-vít', false, '3.jpg']])
  assert.deepEqual([quiz.explanation, quiz.errors, quiz.warnings], ['Môi-se dẫn dân Israel.', [], []])
  const vid = by['gioi-thieu-video']
  assert.deepEqual([vid.type, vid.video, vid.channel, vid.text, vid.errors], ['video', 'AbCdEfGhIjK', 'Dark Grace', 'Xem tập mới!', []])
})

test('bai dang: loi va canh bao', () => {
  const root = tmp()
  const P = (dir, f, data = 'x') => write(path.join(root, 'posts', dir, f), data)
  for (let i = 1; i <= 11; i++) P('qua-nhieu-anh', `${i}.jpg`)
  P('chi-co-binhchon', 'binhchon.txt', 'A\nB') // khong co noidung.txt: binhchon khong thanh than bai
  P('thieu-lua-chon', 'noidung.txt', 'Hỏi?')
  P('thieu-lua-chon', 'binhchon.txt', 'Chỉ một')
  P('nam-lua-chon', 'binhchon.txt', 'a\nb\nc\nd\ne')
  P('lua-chon-dai', 'binhchon.txt', `${'x'.repeat(66)}\nngắn`)
  P('anh-dai', 'binhchon.txt', `${'y'.repeat(37)}\nngắn`)
  P('anh-dai', '1.jpg'); P('anh-dai', '2.jpg')
  P('hai-dap-an', 'cauhoi.txt', '* a\n* b')
  P('khong-dap-an', 'cauhoi.txt', 'a\nb')
  P('tron-loai', 'noidung.txt', 'Video: https://youtu.be/AbCdEfGhIjK\n---\nx')
  P('tron-loai', 'binhchon.txt', 'a\nb')
  P('video-sai', 'noidung.txt', 'Loại: video\nVideo: abc\n---\nx')
  P('anh-thieu', 'noidung.txt', 'x')
  P('anh-thieu', 'cauhoi.txt', '* a | khong-co.jpg\nb')
  P('2020-01-01_08h00_da-qua', 'noidung.txt', 'Cũ')
  P('loai-anh-khong-anh', 'noidung.txt', 'Loại: ảnh\n---\nx')
  P('2030-01-01_19h50_lam-tron', 'noidung.txt', 'x')
  const r = sc.scan(root)
  const by = Object.fromEntries(r.posts.map((p) => [p.name.replace(/ /g, '-'), p]))
  assert.match(by['qua-nhieu-anh'].errors.join(), /11 ảnh.*tối đa 10/)
  assert.deepEqual([by['chi-co-binhchon'].type, by['chi-co-binhchon'].text, by['chi-co-binhchon'].errors], ['poll', '', []])
  assert.match(by['chi-co-binhchon'].warnings.join(), /Chưa có câu hỏi/)
  assert.match(by['thieu-lua-chon'].errors.join(), /ít nhất 2/)
  assert.match(by['nam-lua-chon'].errors.join(), /tối đa 4/)
  assert.match(by['lua-chon-dai'].errors.join(), /66 ký tự, tối đa 65/)
  assert.match(by['anh-dai'].errors.join(), /37 ký tự, tối đa 36/)
  assert.match(by['hai-dap-an'].errors.join(), /2 câu đánh dấu \*/)
  assert.match(by['khong-dap-an'].errors.join(), /chưa đánh dấu \*/)
  assert.match(by['tron-loai'].errors.join(), /một loại.*Video: và binhchon\.txt/)
  assert.match(by['video-sai'].errors.join(), /Không hiểu video "abc"/)
  assert.match(by['anh-thieu'].errors.join(), /Không thấy ảnh "khong-co\.jpg"/)
  assert.deepEqual([by['da-qua'].when, by['da-qua'].errors], [null, []])
  assert.match(by['da-qua'].warnings.join(), /đã qua, tool sẽ đăng ngay/)
  assert.match(by['loai-anh-khong-anh'].errors.join(), /không có ảnh/)
  assert.equal(by['lam-tron'].when, new Date(2030, 0, 1, 20, 0).toISOString())
  assert.match(by['lam-tron'].warnings.join(), /19:50 được làm tròn thành 20:00/)
  // HUONG-DAN.txt co phan bai dang
  sc.createSkeleton(root)
  assert.match(fs.readFileSync(path.join(root, 'HUONG-DAN.txt'), 'utf8'), /cauhoi\.txt[\s\S]*Kênh: @tenkenh/)
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
  // len lich -> publishAt (hop thoai tai len chon "Len lich"), ngay lay theo gio dang
  const s = md.buildVideoMeta(item, { ...preset, privacy: 'public' }, { publishAt: new Date(2026, 10, 5, 19).toISOString() })
  assert.equal(s.publishAt, new Date(2026, 10, 5, 19).toISOString())
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

test('thu muc video phang: video + thumbnail cung ten, phu de, .txt, trung ten, bo da-dang', () => {
  const d = tmp()
  write(path.join(d, 'Bí ẩn tập 7.mp4'), 'v'.repeat(10))
  write(path.join(d, 'Bí ẩn tập 7.jpg'))
  write(path.join(d, 'Bí ẩn tập 7.png')) // anh thu 2: dung .jpg, canh bao
  write(path.join(d, 'Bí ẩn tập 7.vi.srt'))
  write(path.join(d, 'Bí ẩn tập 7.en.srt'))
  write(path.join(d, 'Khác tập 7.vi.srt')) // phu de cua video khac: bo
  write(path.join(d, 'Hậu trường.MOV'))
  write(path.join(d, 'hậu trường.WEBP'))
  write(path.join(d, 'Hậu trường.txt'), 'Thẻ: a, b\n---\nMô tả riêng')
  write(path.join(d, 'Không ảnh.mkv'))
  write(path.join(d, 'Ảnh to.mp4'))
  write(path.join(d, 'Ảnh to.jpeg'), Buffer.alloc(2 * 1024 * 1024 + 1))
  write(path.join(d, 'ghi chú.txt')) // file le: bo
  write(path.join(d, 'da-dang', 'Cũ.mp4')) // da dang: bo
  write(path.join(d, 'da-dang', 'Cũ.jpg'))
  const r = sc.scanVideos(d)
  assert.deepEqual(r.errors, [])
  const by = Object.fromEntries(r.videos.map((v) => [v.name, v]))
  assert.deepEqual(Object.keys(by).sort(), ['Ảnh to', 'Bí ẩn tập 7', 'Hậu trường', 'Không ảnh'].sort())
  const a = by['Bí ẩn tập 7']
  assert.equal(a.layout, 'flat')
  assert.equal(a.titleFromName, true)
  assert.equal(a.key, path.join(d, 'Bí ẩn tập 7.mp4'))
  assert.equal(a.thumbnail, path.join(d, 'Bí ẩn tập 7.jpg'))
  assert.equal(a.episode, '7')
  assert.deepEqual(a.subtitles.map((x) => x.lang).sort(), ['en', 'vi'])
  assert.equal(a.files.length, 4) // video + anh + 2 phu de (khong lay .png thu 2)
  assert.equal(a.doneDir, path.join(d, 'da-dang'))
  assert.equal(a.infoFile, path.join(d, 'Bí ẩn tập 7.txt')) // chua co: Gemini se tao
  assert.match(a.warnings.join('\n'), /2 ảnh cùng tên, tool dùng "Bí ẩn tập 7.jpg"/)
  assert.deepEqual(a.errors, [])
  const h = by['Hậu trường'] // khac hoa thuong van khop
  assert.equal(path.basename(h.thumbnail), 'hậu trường.WEBP')
  assert.equal(h.info.the, 'a, b')
  assert.equal(h.info.mo_ta, 'Mô tả riêng')
  assert(h.files.includes(path.join(d, 'Hậu trường.txt')))
  assert.match(by['Không ảnh'].warnings[0], /Chưa có ảnh thumbnail cùng tên/)
  assert.deepEqual(by['Ảnh to'].errors, []) // khong con gioi han 2 MB
  // trung ten (khac duoi): loi
  write(path.join(d, 'Không ảnh.mp4'))
  const dup = sc.scanVideos(d).videos.filter((v) => v.name === 'Không ảnh')
  assert.equal(dup.length, 2)
  assert(dup.some((v) => /Trùng tên/.test(v.errors.join(' '))))
  // tieu de = ten file; .txt co "Tieu de:" thi lay dong do
  assert.equal(md.buildVideoMeta(a, { ...md.defaultPreset(), title: '{ten_video} | Tập {so_tap}' }).title, 'Bí ẩn tập 7')
  assert.equal(md.buildVideoMeta({ ...a, info: { tieu_de: 'Tên riêng', vars: {} } }, md.defaultPreset()).title, 'Tên riêng')
  // thu muc trong / chua chon / khong ton tai
  assert.deepEqual(sc.scanVideos(tmp()).videos, [])
  assert.match(sc.scanVideos('').errors[0], /Chưa chọn thư mục video/)
  assert.match(sc.scanVideos(path.join(d, 'khong-co')).errors[0], /Không tìm thấy/)
})

test('thu muc video: van doc thu muc con kieu cu va <goc>/videos/', () => {
  const d = tmp()
  write(path.join(d, 'Phẳng.mp4'))
  write(path.join(d, 'Tập cũ', 'video.mp4'))
  write(path.join(d, 'Tập cũ', 'thumbnail.jpg'))
  write(path.join(d, 'Tập cũ', 'info.txt'), 'Tiêu đề: Tập cũ hay\n')
  write(path.join(d, 'anh-linh-tinh', 'a.jpg')) // khong co video: bo qua, khong loi
  write(path.join(d, 'videos', '2026-11-04_tap-9', 'tap9.mp4'))
  write(path.join(d, 'posts', 'bai', 'noidung.txt'), 'x') // bai dang: bo
  const r = sc.scanVideos(d)
  assert.deepEqual(r.errors, [])
  const ids = r.videos.map((v) => v.id).sort()
  assert.deepEqual(ids, ['tep/Phẳng.mp4', 'thu-muc/Tập cũ', 'videos/2026-11-04_tap-9'].sort())
  const old = r.videos.find((v) => v.id === 'thu-muc/Tập cũ')
  assert.equal(old.layout, 'folder')
  assert.equal(old.key, path.join(d, 'Tập cũ'))
  assert.equal(old.info.tieu_de, 'Tập cũ hay')
  assert.equal(old.doneDir, path.join(d, 'da-dang'))
  const v9 = r.videos.find((v) => v.id === 'videos/2026-11-04_tap-9')
  assert.equal(v9.date, '2026-11-04')
  assert.equal(v9.layout, 'folder')
})

test('chuyen file da dang vao da-dang/ (thu muc phang)', () => {
  const up = require('../src/uploader')
  const d = tmp()
  const files = ['A.mp4', 'A.jpg', 'A.vi.srt', 'A.txt'].map((f) => path.join(d, f))
  for (const f of files) write(f)
  write(path.join(d, 'da-dang', 'A.mp4'), 'cu') // da co file cung ten -> "A (2).mp4"
  write(path.join(d, 'B.mp4'))
  const r = up.moveDoneFiles(path.join(d, 'da-dang'), { video: files[0], files }, ['Đã đăng: https://youtu.be/x'])
  assert.equal(r.moved, true)
  assert.equal(r.video, path.join(d, 'da-dang', 'A (2).mp4'))
  assert.deepEqual(fs.readdirSync(d).sort(), ['B.mp4', 'da-dang'])
  assert.deepEqual(fs.readdirSync(path.join(d, 'da-dang')).sort(), ['A (2).mp4', 'A.jpg', 'A.ket-qua.txt', 'A.mp4', 'A.txt', 'A.vi.srt'].sort())
  assert.match(fs.readFileSync(path.join(d, 'da-dang', 'A.ket-qua.txt'), 'utf8'), /youtu\.be\/x/)
  // quet lai: chi con B
  assert.deepEqual(sc.scanVideos(d).videos.map((v) => v.name), ['B'])
})

test('mau: che do hien thi + Cong chieu + lich ngay gio cu the', () => {
  const n = md.normalizePreset({ id: 'x', privacy: 'bi-mat', premiere: 'yes', schedule: { mode: 'la', date: '30/10/2026', time: '9:5' } })
  assert.equal(n.privacy, 'private')
  assert.equal(n.premiere, false)
  assert.equal(n.schedulePremiere, false)
  assert.deepEqual([n.schedule.mode, n.schedule.date, n.schedule.time], ['now', '', '09:00'])
  const ok = md.normalizePreset({ id: 'y', privacy: 'public', premiere: true, schedulePremiere: true, schedule: { mode: 'date', date: '2026-10-30', time: '9:15', intervalHours: 0 } })
  assert.deepEqual([ok.schedule.mode, ok.schedule.date, ok.schedule.time], ['date', '2026-10-30', '09:15'])
  const item = { name: 'Video', titleFromName: true, info: { vars: {} } }
  // Cong khai + Cong chieu ngay
  const m1 = md.buildVideoMeta(item, ok)
  assert.deepEqual([m1.privacy, m1.premiere, m1.publishAt, m1.schedulePremiere], ['public', true, null, false])
  // Cong chieu ngay chi di voi Cong khai
  assert.equal(md.buildVideoMeta(item, { ...ok, privacy: 'unlisted' }).premiere, false)
  // len lich + Dat lam video Cong chieu
  const m2 = md.buildVideoMeta(item, ok, { publishAt: '2026-10-30T02:15:00.000Z' })
  assert.deepEqual([m2.publishAt, m2.schedulePremiere], ['2026-10-30T02:15:00.000Z', true])
  assert.equal(md.buildVideoMeta(item, { ...ok, schedulePremiere: false }, { publishAt: '2026-10-30T02:15:00.000Z' }).schedulePremiere, false)
})

test('xep lich: ngay gio cu the, video sau cach N gio', () => {
  const now = new Date(2026, 9, 28, 12, 0)
  const iso = (...a) => new Date(...a).toISOString()
  const P = (schedule) => () => ({ ...md.defaultPreset(), schedule: { ...md.defaultPreset().schedule, ...schedule } })
  const s = md.planSchedule([{}, {}, {}], P({ mode: 'date', date: '2026-10-30', time: '09:00', intervalHours: 24 }), now).map((x) => x.publishAt)
  assert.deepEqual(s, [iso(2026, 9, 30, 9), iso(2026, 9, 31, 9), iso(2026, 10, 1, 9)])
  // 0 gio: cung gio
  const same = md.planSchedule([{}, {}], P({ mode: 'date', date: '2026-10-30', time: '21:15', intervalHours: 0 }), now).map((x) => x.publishAt)
  assert.deepEqual(same, [iso(2026, 9, 30, 21, 15), iso(2026, 9, 30, 21, 15)])
  // chua chon ngay -> dang ngay
  assert.deepEqual(md.planSchedule([{}], P({ mode: 'date', date: '' }), now).map((x) => x.publishAt), [null])
  // ngay da qua -> dang ngay + canh bao
  const past = md.planSchedule([{}], P({ mode: 'date', date: '2026-10-01', time: '09:00' }), now)[0]
  assert.equal(past.publishAt, null)
  assert.match(past.warning, /đã qua/)
  // "Gio dang:" trong .txt van uu tien
  assert.deepEqual(md.planSchedule([{ info: { gio_dang: new Date(2026, 10, 5, 8) } }], P({ mode: 'date', date: '2026-10-30' }), now).map((x) => x.publishAt), [iso(2026, 10, 5, 8)])
  // ngay trong ten thu muc (kieu cu) + gio cua lich
  assert.deepEqual(md.planSchedule([{ date: '2026-11-04' }], P({ mode: 'date', date: '2026-10-30', time: '07:30' }), now).map((x) => x.publishAt), [iso(2026, 10, 4, 7, 30)])
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

test('bo du lieu YouTube Data API cu: OAuth, token, kenh API -> kenh dang video mac dinh', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ youtubeChannel: { id: 'UCcu00000000000000000000', title: 'Kênh cũ' }, apiChannels: [{ id: 'UCcu00000000000000000000', title: 'Kênh cũ' }] }))
  const s = new Store(dir)
  for (const k of ['oauthClient', 'youtubeToken', 'ytToken:UCcu00000000000000000000', 'gemini']) s.setSecret(k, 'x')
  assert.equal(dropApiData(s), 4)
  assert.deepEqual(Object.keys(s.readSecrets()), ['gemini'], 'giu Gemini key')
  const again = new Store(dir)
  assert.equal(again.settings.uploadChannel, 'UCcu00000000000000000000')
  assert(!('youtubeChannel' in again.settings) && !('apiChannels' in again.settings))
  assert.equal(dropApiData(again), 0, 'chay lai khong lam gi')
  // da chon kenh dang video thi giu nguyen
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ uploadChannel: 'UCmoi00000000000000000000', youtubeChannel: { id: 'UCcu00000000000000000000' } }))
  const third = new Store(dir)
  dropApiData(third)
  assert.equal(third.settings.uploadChannel, 'UCmoi00000000000000000000')
})

test('preset cu (dang qua API): muc khac mac dinh chuyen sang mau Studio, bo khoi preset', () => {
  const old = { ...md.defaultPreset('p', 'Cũ'), categoryId: '27', language: 'ja', license: 'creativeCommon', embeddable: false, syntheticMedia: true, publicStatsViewable: false, optimize: { ai: 'keep', category: 'keep', license: 'keep', embeddable: 'keep', language: '' } }
  const p = md.normalizePreset(old)
  for (const k of ['categoryId', 'language', 'license', 'embeddable', 'syntheticMedia', 'publicStatsViewable']) assert(!(k in p), k)
  assert.deepEqual([p.optimize.category, p.optimize.language, p.optimize.license, p.optimize.embeddable, p.optimize.ai], ['27', 'Tiếng Nhật', 'creativeCommon', 'no', 'yes'])
  // gia tri mac dinh cu (Moi nguoi va blog, tieng Viet / tieng Anh, giay phep chuan, cho nhung, khong AI): khong dat gi them
  const plain = md.normalizePreset({ ...md.defaultPreset(), categoryId: '22', language: 'en', license: 'youtube', embeddable: true, syntheticMedia: false, optimize: { category: 'keep', language: '', ai: 'keep' } })
  assert.deepEqual([plain.optimize.category, plain.optimize.language, plain.optimize.ai], ['keep', '', 'keep'])
  // mau da dat san thi mau thang
  const set = md.normalizePreset({ categoryId: '27', optimize: { category: '10' } })
  assert.equal(set.optimize.category, '10')
})

;(async () => {
  let failed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok   ${name}`) } catch (e) { failed++; console.log(`  FAIL ${name}\n${e.stack}`) }
  }
  console.log(failed ? `${failed} bai loi` : `ALL ${tests.length} PASSED`)
  process.exit(failed ? 1 : 0)
})()
