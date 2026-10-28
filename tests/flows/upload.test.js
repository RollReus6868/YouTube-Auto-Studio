// Bai kiem cho src/flows/upload.js voi hop thoai tai len gia tests/mock-yt/upload (theo cac buoc nguoi dung quay)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { uploadVideo, uploadPhase, LABELS, SEL, _t } = require('../../src/flows/upload')
const { defaultTemplate, keepAll, fmtStudioDate } = require('../../src/optimize-template')
const { ACCOUNTS } = require('../mock-yt/accounts/routes')

const UC = 'UCup0000000000000000test'
const EMAIL = 'athang@versee.net'
const NUTSHELL = ACCOUNTS[EMAIL].channels.find((c) => c.name === 'Dark Bible - in a Nutshell').uc
const CHANNEL_DESC = 'Donate to Us: https://example.org/donate\nGet the ebook here: https://example.org/ebook'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// PNG that (giai ma duoc) kich thuoc w x h
function png(file, w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  return file
}
const files = (tmp) => {
  const video = path.join(tmp, 'Bí ẩn tập 7.mp4')
  fs.writeFileSync(video, Buffer.alloc(256 * 1024, 1))
  const srt = path.join(tmp, 'phude.vi.srt')
  fs.writeFileSync(srt, '1\n00:00:01,000 --> 00:00:02,000\nXin chào\n')
  return { video, thumb: png(path.join(tmp, 'thumbnail.png'), 128, 72), srt }
}
// tinh huong cho trang gia (localStorage 'up-<ten>', cung goc voi trang Studio gia)
const flags = async (ctx, f) => {
  await ctx.page.goto(`${ctx.mock.base}/studio/__chua-co-trang`)
  await ctx.page.eval((f) => { localStorage.clear(); for (const [k, v] of Object.entries(f)) localStorage.setItem(`up-${k}`, JSON.stringify(v)) }, f)
}
// dang nhap tai khoan gia + chon kenh "Dark Bible - in a Nutshell" (trang tong quan kenh co nut tai len)
const login = async (ctx) => {
  await ctx.page.goto(`${ctx.mock.base}/studio/__login?email=${encodeURIComponent(EMAIL)}`)
  await ctx.page.goto(`${ctx.mock.base}/studio/__switch?uc=${NUTSHELL}`)
  return NUTSHELL
}
const uploads = async (mock) => { await sleep(200); return mock.events.filter((e) => e.type === 'upload') }
const TITLE = 'Bí ẩn rừng Amazon | Tập 7'
const DESC = 'Tập 7: đi sâu vào rừng.\n\nĐăng ký kênh nhé!\n#bian #rung'
const JOB = (f, extra = {}) => ({
  uc: UC, file: f.video, title: TITLE, description: DESC, tags: ['bí ẩn', 'rừng amazon'], playlists: [], madeForKids: false, thumbnail: f.thumb, subtitles: [],
  privacy: 'public', publishAt: null, notifySubscribers: true, template: keepAll(), ...extra,
})
const run = (ctx, job, o = {}) => {
  const steps = []
  const progress = []
  const p = uploadVideo(ctx.page, job, { urls: ctx.urls, log: (l, m) => ctx.logs.push(`${l} ${m}`), onStep: (s) => steps.push(s), onProgress: (n) => progress.push(n), ...o })
  return { p, steps, progress }
}
const shots = () => { const d = path.join(os.tmpdir(), 'ya-flow-shots'); return fs.existsSync(d) ? fs.readdirSync(d) : [] }
const inDays = (d, h, m = 0) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, m, 0, 0); return t }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

module.exports = [
  ['nhan tien do tai len (Viet / Anh)', async () => {
    assert.deepEqual(uploadPhase('Đã tải được 5% ... Còn 4 phút'), { phase: 'uploading', pct: 5 })
    assert.deepEqual(uploadPhase('Đang tải lên 45% ... Còn 2 phút'), { phase: 'uploading', pct: 45 })
    assert.deepEqual(uploadPhase('Uploading 7% ... 3 minutes left'), { phase: 'uploading', pct: 7 })
    assert.equal(uploadPhase('Đã tải được 100%').phase, 'uploaded')
    assert.equal(uploadPhase('Tải lên hoàn tất ... Quá trình xử lý sẽ sớm bắt đầu').phase, 'uploaded')
    assert.equal(uploadPhase('Đã tải lên xong ... Đang kiểm tra').phase, 'uploaded')
    assert.equal(uploadPhase('Processing SD version...').phase, 'uploaded')
    assert.equal(uploadPhase('Đã kiểm tra xong. Không phát hiện vấn đề nào.').phase, 'uploaded')
    assert.equal(uploadPhase('Đã đạt đến giới hạn tải lên hằng ngày').phase, 'error')
    assert.equal(uploadPhase('').phase, '')
  }],

  ['dang theo dung video quay: trang tong quan -> nut tai len, mo ta giu mo ta kenh, mau mac dinh trong hop thoai, man hinh ket thuc, Van xuat ban', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, {})
    const uc = await login(ctx)
    const h0 = ctx.mock.hits.length
    const { p, steps, progress } = run(ctx, JOB(f, { uc, template: defaultTemplate(), channelName: 'Dark Bible - in a Nutshell' }))
    const r = await p
    const [u] = await uploads(ctx.mock)
    assert(u, 'da bam Luu')
    const hits = ctx.mock.hits.slice(h0)
    assert(hits.includes(`GET /studio/channel/${uc}`), `mo trang tong quan kenh: ${hits.join(', ')}`)
    assert(!hits.some((h) => /d=ud/.test(h)), 'khong can duong dan ?d=ud')
    assert.equal(r.id, u.id)
    assert.equal(r.url, `https://youtu.be/${u.id}`)
    assert.deepEqual([u.uc, u.cookieCh], [uc, uc])
    assert.deepEqual([u.file, u.size], ['Bí ẩn tập 7.mp4', 256 * 1024])
    assert.equal(u.title, TITLE, 'thay ten tep Studio tu dien bang tieu de')
    assert.equal(u.description, `${CHANNEL_DESC}\n\n${DESC}`, 'giu mo ta co san cua kenh, xuong 2 dong roi them mo ta')
    assert.equal(u.thumbnail, 'thumbnail.png')
    assert.deepEqual(u.playlists, ['Bible - in a Nutshell', 'Bible - in a Nutshell (Podcast)'], 'tich het danh sach phat cua kenh (mau: tu chon 3)')
    assert.equal(u.kids, 'NOT_MFK')
    assert.deepEqual([u.paid, u.ai], ['no', 'yes'])
    assert.deepEqual(u.tags, ['Bible in a Nutshell', 'Bí ẩn rừng Amazon | Tập 7', 'bí ẩn', 'rừng amazon'], 'giu the co san + tieu de + the cua video')
    assert.deepEqual([u.language, u.titleLanguage], ['Tiếng Anh (Hoa Kỳ)', 'Tiếng Anh (Hoa Kỳ)'], 'ngon ngu giu mac dinh')
    assert.equal(u.recDate, fmtStudioDate(new Date()), 'ngay quay = hom nay')
    assert.equal(u.location, 'United States')
    assert.deepEqual([u.license, u.embed, u.notify], ['Giấy phép chuẩn của YouTube', true, true])
    assert.equal(u.remix, 'Không cho phép phối lại')
    assert.deepEqual([u.category, u.comments, u.showLikes], ['Mọi người và blog', 'Bật', true])
    assert.equal(u.endscreen, 'Lấy màn hình kết thúc của video gần đây nhất')
    assert.equal(u.visibility, 'PUBLIC')
    assert.equal(u.earlyDone, false, 'cho tai len xong moi bam Luu')
    assert.equal(u.anyway, true, 'bam "Vẫn xuất bản" khi Studio con kiem tra')
    assert(ctx.mock.events.some((e) => e.type === 'checks-warning'))
    assert.deepEqual(r.warnings, [], ctx.logs.join('\n'))
    assert.deepEqual(r.missed, [])
    for (const k of ['playlists', 'paidPromotion', 'ai', 'tags', 'recordingDate', 'location', 'remix', 'endScreen']) assert(r.applied.includes(k), `da dat ${k}: ${r.applied}`)
    assert.equal(r.schedule, null)
    assert(progress.length && progress[progress.length - 1] === 100, `tien do: ${progress}`)
    for (const s of ['open', 'file', 'details', 'thumbnail', 'playlist', 'more', 'endscreen', 'visibility', 'wait', 'publish']) assert(steps.includes(s), `buoc ${s}: ${steps}`)
    assert(ctx.mock.events.some((e) => e.type === 'share-closed' && e.id === u.id), 'dong hop thoai chia se')
  }],

  ['len lich (chua dang nhap: trang tong quan khong mo -> ?d=ud khong tu mo -> Tao -> Tai video len), mau giu nguyen het', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nodialog: true, nocheckwarn: true })
    const h0 = ctx.mock.hits.length
    const at = inDays(3, 19, 0)
    const r = await run(ctx, JOB(f, { thumbnail: null, tags: [], publishAt: at.toISOString(), privacy: 'private' })).p
    const [u] = await uploads(ctx.mock)
    assert(ctx.mock.hits.slice(h0).includes(`GET /studio/channel/${UC}/videos/upload?d=ud`), 'mo bang ?d=ud')
    assert.equal(u.visibility, 'SCHEDULE')
    assert.equal(u.scheduleDate, `${at.getDate()} thg ${at.getMonth() + 1}, ${at.getFullYear()}`)
    assert.equal(u.scheduleTime, '19:00')
    assert.equal(r.schedule, at.toISOString())
    assert.equal(r.id, u.id)
    assert.equal(u.description, `${CHANNEL_DESC}\n\n${DESC}`)
    assert.deepEqual([u.playlists, u.paid, u.ai, u.recDate, u.location, u.endscreen, u.anyway], [[], '', '', '', '', '', false], 'mau giu nguyen: khong dung toi muc nao')
    assert.deepEqual(u.tags, ['Bible in a Nutshell'])
    assert.deepEqual(r.missed, [])
  }],

  ['Studio tieng Anh, tai len cham, buoc Kiem tien, Kiem tra khoa nut Tiep, khong co nut tai len -> Tao -> Tai video len', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { en: true, slow: true, monet: true, checkswait: true, noicon: true, morepl: true })
    const uc = await login(ctx)
    const at = inDays(2, 8, 30)
    const { p, progress } = run(ctx, JOB(f, { uc, madeForKids: true, publishAt: at.toISOString(), playlists: ['Sermons'], template: { ...defaultTemplate(), recordingDate: 'publish' } }))
    const r = await p
    const [u] = await uploads(ctx.mock)
    assert.equal(u.lang, 'en')
    assert.equal(u.title, TITLE)
    assert.deepEqual([u.kids, u.paid, u.ai], ['MFK', 'no', 'yes'])
    assert.deepEqual(u.playlists, ['Bible - in a Nutshell', 'Bible - in a Nutshell (Podcast)', 'Sermons'], 'danh sach cua preset + tu chon 3 dau tien')
    assert.equal(u.remix, "Don't allow remixing")
    assert.equal(u.recDate, `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}`, 'ngay quay = ngay dang (len lich)')
    assert.equal(u.endscreen, 'Import from latest video')
    assert.equal(u.visibility, 'SCHEDULE')
    assert.equal(u.scheduleDate, `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}`)
    assert.equal(u.scheduleTime, '8:30 AM')
    assert.equal(u.earlyDone, false)
    assert(progress.filter((n) => n > 0 && n < 100).length >= 2, `tien do tang dan: ${progress}`)
    assert.deepEqual(r.warnings, [], ctx.logs.join('\n'))
    assert.deepEqual(r.missed, [])
  }],

  ['phu de, danh sach phat moi (tu tao), rieng tu, tat thong bao, mau: ngon ngu, danh muc, giay phep, nhung, binh luan', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, {})
    const extra = path.join(ctx.tmp, 'phude.en.srt')
    fs.writeFileSync(extra, '1\n00:00:01,000 --> 00:00:02,000\nHello\n')
    const template = { ...keepAll(), language: 'Tiếng Việt', category: '27', license: 'creativeCommon', embeddable: 'no', comments: 'off' }
    const r = await run(ctx, JOB(f, { privacy: 'private', playlists: ['Sermons', 'Tập mới 2026'], subtitles: [{ file: f.srt, lang: 'vi' }, { file: extra, lang: 'en' }], notifySubscribers: false, template })).p
    const [u] = await uploads(ctx.mock)
    assert.equal(u.visibility, 'PRIVATE')
    assert.deepEqual(u.playlists, ['Sermons', 'Tập mới 2026'])
    assert.deepEqual(ctx.mock.events.filter((e) => e.type === 'playlist-created').map((e) => e.name), ['Sermons', 'Tập mới 2026'])
    assert.deepEqual(u.subtitles, [{ name: 'phude.vi.srt', timing: 'UPLOAD_TIMED' }])
    assert.deepEqual([u.language, u.titleLanguage, u.category], ['Tiếng Việt', 'Tiếng Việt', 'Giáo dục'])
    assert.deepEqual([u.notify, u.license, u.embed, u.comments], [false, 'Creative Commons - Ghi công', false, 'Tắt'])
    assert.equal(u.endscreen, '')
    assert.equal(r.warnings.length, 1, r.warnings.join('\n'))
    assert.match(r.warnings[0], /Chưa thêm phụ đề phude\.en\.srt: hộp thoại tải lên chỉ thêm một phụ đề/)
    assert.deepEqual(r.missed, [])
    assert.deepEqual(r.applied.sort(), ['category', 'comments', 'embeddable', 'language', 'license', 'playlists', 'tags'], 'the cua video (job) cung tinh')
  }],

  ['kenh chua xac minh (khong tai duoc hinh thu nho), khong co muc phu de, ma video chi o hop thoai chia se, khong doc duoc tien do: Luu som roi giu trang toi khi tai xong', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nothumb: true, nosubs: true, noid: true, hidelabel: true })
    const r = await run(ctx, JOB(f, { subtitles: [{ file: f.srt, lang: 'vi' }] })).p
    const [u] = await uploads(ctx.mock)
    assert.equal(r.id, u.id, 'doc ma o #share-url')
    assert.equal(u.thumbnail, '')
    assert.match(r.warnings.join('\n'), /Không đặt được hình thu nhỏ: .*xác minh số điện thoại/)
    assert.match(r.warnings.join('\n'), /Chưa thêm phụ đề phude\.vi\.srt/)
    assert(shots().some((x) => /dang-video-Hình-thu-nhỏ/.test(x)), 'luu anh trang khi bo qua hinh thu nho')
    assert.equal(u.earlyDone, true, 'bam Luu khi chua tai xong')
    const fin = ctx.mock.events.find((e) => e.type === 'upload-finished')
    assert(fin && fin.published, 'chi tra ve sau khi video tai len xong (hop thoai da dong)')
  }],

  ['HTML that (loi-trang 28/10): bo chon buoc chon tep, nut tai len / Tao, hop thoai "Ban da hoan tat" -> stale, nut Da hieu', async (ctx) => {
    await ctx.page.goto(`${ctx.urls.studio}/that-upload/chon-tep`)
    const p = ctx.page
    assert(await p.has(LABELS.uploadIcon), 'nut tai len #upload-icon')
    assert(await p.has(LABELS.create), 'nut Tao')
    assert.equal(await p.eval(() => document.querySelector('ytcp-uploads-dialog').getAttribute('workflow-step')), 'SELECT_FILES')
    assert.equal(await p.count({ selector: SEL.fileInput, hidden: true }), 1, 'o chon file input[name=Filedata]')
    assert.equal(await p.eval((t) => { const el = window.__ya.one(t); return el && el.closest('ytcp-button').id }, LABELS.selectFiles), 'select-files-button')
    assert.equal(await p.text(LABELS.selectFiles), 'Chọn tệp')
    assert.equal(await p.count({ selector: LABELS.closeDialog.any }), 1, 'nut Dong hop thoai')
    // buoc chon tep: chua co Tiep / Luu, chua co tien do, khong co loi (ytcp-error-section an)
    for (const k of ['next', 'done']) {
      assert.equal(await p.count({ selector: LABELS[k].any }), 0, `${k} dang an`)
      assert.equal(await p.count({ selector: LABELS[k].any, hidden: true }), 1, `${k} co trong hop thoai`)
    }
    assert.equal(await p.text({ selector: SEL.progress, hidden: true }), '')
    assert.equal(await p.count({ selector: SEL.title }), 0, 'chua toi trang Chi tiet')
    const b = await p.eval(_t.findBlocker, SEL, LABELS.trustStale, LABELS.verify)
    assert.equal(b.kind, 'stale')
    assert.match(b.text, /Bạn đã hoàn tất.*Hãy thử làm mới trang/)
    assert.equal(await p.text({ selector: LABELS.trustClose.any }), 'Đã hiểu')
  }],

  ['video dai: "Ban da hoan tat ... lam moi trang" 2 lan -> Da hieu, lam moi Studio, mo lai hop thoai, chon lai file -> dang duoc', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { trust: 2, nocheckwarn: true })
    const uc = await login(ctx)
    const h0 = ctx.mock.hits.length
    const r = await run(ctx, JOB(f, { uc, thumbnail: null, privacy: 'unlisted' })).p
    const [u] = await uploads(ctx.mock)
    assert.equal(u.visibility, 'UNLISTED')
    assert.equal(r.id, u.id)
    assert.equal(ctx.mock.events.filter((e) => e.type === 'trust-shown').length, 2)
    assert.equal(ctx.mock.events.filter((e) => e.type === 'trust-closed').length, 2, 'bam "Đã hiểu" moi lan')
    assert.equal(ctx.mock.hits.slice(h0).filter((h) => h === `GET /studio/channel/${uc}`).length, 3, 'mo trang tong quan 1 lan + lam moi 2 lan')
    assert.equal(ctx.mock.events.filter((e) => e.type === 'upload-open').length, 3)
    assert.match(ctx.logs.join('\n'), /bấm "Đã hiểu", tải lại Studio rồi chọn lại file \(lần 1\/3\)/)
    assert.match(ctx.logs.join('\n'), /bấm "Đã hiểu", xoá bộ nhớ đệm của Studio \(giữ đăng nhập\) rồi chọn lại file \(lần 2\/3\)/)
    assert(shots().some((x) => /dang-video-ban-da-hoan-tat/.test(x)), 'luu anh trang khi gap hop thoai')
  }],

  ['Studio tieng Anh: van "You\'re all set ... refresh" sau 3 lan lam moi -> dung, bao ro, khong noi ban nhap', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { trust: 4, en: true })
    const uc = await login(ctx)
    await assert.rejects(run(ctx, JOB(f, { uc, thumbnail: null })).p, (e) => {
      assert.match(e.message, /sau 3 lần làm mới Studio/)
      assert.doesNotMatch(e.message, /bản nháp/)
      return true
    })
    assert.equal(ctx.mock.events.filter((e) => e.type === 'trust-closed').length, 3)
    assert(ctx.mock.hits.some((h) => /^GET \/yt\/features/.test(h)), 'lan 3: mo trang Tinh nang cua kenh')
    assert.equal((await uploads(ctx.mock)).length, 0)
  }],

  ['Google doi xac minh danh tinh (Viet / Anh) -> dung voi loi ro rang, khong bam gi trong hop thoai xac minh', async (ctx) => {
    const f = files(ctx.tmp)
    for (const en of [false, true]) {
      await flags(ctx, { verify: true, en })
      const uc = await login(ctx)
      await assert.rejects(run(ctx, JOB(f, { uc, thumbnail: null })).p, (e) => {
        assert.match(e.message, /xác minh danh tính/)
        assert.match(e.message, /trang Tài khoản/)
        assert.match(e.message, /Tool không tự xác minh/)
        assert.doesNotMatch(e.message, /bản nháp/)
        return true
      })
      assert(ctx.mock.events.some((e) => e.type === 'verify-shown'))
      assert(!ctx.mock.events.some((e) => e.type === 'verify-clicked'), 'khong bam nut nao cua hop thoai xac minh')
      assert.equal((await uploads(ctx.mock)).length, 0)
    }
  }],

  ['Cong khai + "Dat o che do Cong chieu ngay"', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nocheckwarn: true })
    const r = await run(ctx, JOB(f, { thumbnail: null, privacy: 'public', premiere: true })).p
    const [u] = await uploads(ctx.mock)
    assert.deepEqual([u.visibility, u.premiere, u.schedulePremiere], ['PUBLIC', true, false])
    assert.deepEqual([r.visibility, r.premiere], ['public', true])
    assert.deepEqual(r.warnings, [], ctx.logs.join('\n'))
  }],

  ['Studio tieng Anh: Khong cong khai (Cong chieu chi co o Cong khai -> bo qua + canh bao)', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nocheckwarn: true, en: true })
    const r = await run(ctx, JOB(f, { thumbnail: null, privacy: 'unlisted', premiere: true })).p
    const [u] = await uploads(ctx.mock)
    assert.deepEqual([u.visibility, u.premiere, u.lang], ['UNLISTED', false, 'en'])
    assert.deepEqual([r.visibility, r.premiere], ['unlisted', false])
    assert.match(r.warnings.join('\n'), /chỉ dùng được với chế độ Công khai/)
  }],

  ['len lich + "Dat lam video Cong chieu": o ngay khong nhan chu go -> bam lich (thang sau), o gio chon trong danh sach moc 15 phut', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nocheckwarn: true, notypedate: true, timepick: true })
    const at = inDays(40, 21, 15)
    const r = await run(ctx, JOB(f, { thumbnail: null, publishAt: at.toISOString(), schedulePremiere: true })).p
    const [u] = await uploads(ctx.mock)
    assert.equal(u.visibility, 'SCHEDULE')
    assert.equal(u.scheduleDate, `${at.getDate()} thg ${at.getMonth() + 1}, ${at.getFullYear()}`)
    assert.equal(u.scheduleTime, '21:15')
    assert.equal(u.schedulePremiere, true)
    assert(ctx.mock.events.some((e) => e.type === 'calendar-day' && e.date === `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`), 'bam ngay trong lich')
    assert(ctx.mock.events.some((e) => e.type === 'time-picked' && e.time === '21:15'), 'chon gio trong danh sach')
    assert(!ctx.mock.events.some((e) => e.type === 'timezone-clicked'), 'khong doi mui gio')
    assert.deepEqual([r.visibility, r.premiere, r.schedule], ['schedule', true, at.toISOString()])
    assert.deepEqual(r.warnings, [], ctx.logs.join('\n'))
  }],

  ['Studio tieng Anh: len lich bang lich + danh sach gio (9:45 PM), kenh khong co Cong chieu -> canh bao, van len lich', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { nocheckwarn: true, notypedate: true, timepick: true, nopremiere: true, en: true })
    const at = inDays(5, 21, 40) // lam tron len 21:45
    const r = await run(ctx, JOB(f, { thumbnail: null, publishAt: at.toISOString(), schedulePremiere: true })).p
    const [u] = await uploads(ctx.mock)
    assert.equal(u.visibility, 'SCHEDULE')
    assert.equal(u.scheduleDate, `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}`)
    assert.equal(u.scheduleTime, '9:45 PM')
    assert.equal(u.schedulePremiere, false)
    assert.equal(r.premiere, false)
    assert.match(r.warnings.join('\n'), /Chưa đặt được "Đặt làm video Công chiếu": không thấy ô này/)
  }],
  ['loi: gioi han tai len hang ngay -> nem loi ro rang, luu anh trang', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { limit: true })
    const before = shots().length
    await assert.rejects(run(ctx, JOB(f)).p, /YouTube báo: Đã đạt đến giới hạn tải lên hằng ngày/)
    assert.equal((await uploads(ctx.mock)).length, 0)
    assert(shots().length > before, 'co anh trang luc loi')
  }],

  ['loi: tai len hong giua chung -> khong bam Luu', async (ctx) => {
    const f = files(ctx.tmp)
    await flags(ctx, { failmid: true, slow: true })
    await assert.rejects(run(ctx, JOB(f, { thumbnail: null, tags: [] })).p, /YouTube báo: Tải lên không thành công.*bản nháp/)
    assert.equal((await uploads(ctx.mock)).length, 0)
  }],

  ['loi: khong thay file video', async (ctx) => {
    await assert.rejects(run(ctx, { uc: UC, file: path.join(ctx.tmp, 'khong-co.mp4'), title: 'x' }).p, /Không thấy file video khong-co\.mp4/)
  }],
]
